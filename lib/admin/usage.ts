import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import db from "@/lib/db";
import { advisors, appSettings, auditLogs, usageAlerts, users } from "@/lib/schema";
import { notify } from "@/lib/notify/inbox";
import { enqueue } from "@/lib/notify/outbox";

/*
 * AI 用量與費用（w1b-05、I6 觀察期）。
 * 用量來源：messages 的 tokens／cost_micro_usd（每輪 AI 呼叫、含第二層合規審查都記在同一則訊息上）。
 * 衛教模式不記任何東西（N22），所以不在這裡面。
 * 兩道警報（I6）：①這個月總費用超過預算 ②單一使用者今天的費用超過門檻。同一期間同一人只通知一次。
 * N7（顧問 10/14）：②的門檻同時是每人每天上限——超過就不再呼叫 AI，隔天（台灣 0 點）自動恢復。
 * 期間一律以台灣時間切（UTC+8，台灣沒有日光節約）。
 */
const TZ_OFFSET_MS = 8 * 3600_000;
const SETTING_KEY = "ai_alerts";

export const Thresholds = z.object({
  monthlyBudgetUsd: z.number().positive().max(100_000),
  userDailyUsd: z.number().positive().max(1_000),
});
export type Thresholds = z.infer<typeof Thresholds>;
// 顧問 2026-10-14 決定：每月 20 美元；每人每天 0.5 美元就擋（N7），通知門檻跟著一樣（原本 0.15 會誤報，一般客戶聊完約 0.25）
export const DEFAULT_THRESHOLDS: Thresholds = { monthlyBudgetUsd: 20, userDailyUsd: 0.5 };

/** 台灣時間的 YYYY-MM-DD */
export const taipeiDay = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
/** 台灣時間某天 00:00 → 資料庫的 UTC 文字格式 */
const utcText = (taipeiDate: string) => new Date(Date.parse(`${taipeiDate}T00:00:00+08:00`)).toISOString().slice(0, 19).replace("T", " ");
const usd = (micro: number) => micro / 1e6;
const micro = (u: number) => Math.round(u * 1e6);

export async function getThresholds(): Promise<Thresholds> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTING_KEY)).limit(1);
  if (!row) return DEFAULT_THRESHOLDS;
  const p = Thresholds.safeParse(JSON.parse(row.value));
  return p.success ? p.data : DEFAULT_THRESHOLDS;
}

export async function setThresholds(adminId: string, v: Thresholds): Promise<void> {
  const before = await getThresholds();
  await db.insert(appSettings).values({ key: SETTING_KEY, value: JSON.stringify(v), updated_by: adminId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(v), updated_by: adminId, updated_at: sql`to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')` } });
  await db.insert(auditLogs).values({ actor_id: adminId, actor_role: "admin", action: "update_setting", target_type: "setting",
    target_id: `${SETTING_KEY}:${JSON.stringify(before)}→${JSON.stringify(v)}` });
}

export interface UsageSummary {
  today: string;
  month: string;
  todayUsd: number;
  todayCalls: number;
  monthUsd: number;
  monthCalls: number;
  thresholds: Thresholds;
  daily: { day: string; usd: number; calls: number }[];          // 最近 30 天（台灣日期）
  byModel: { model: string; usd: number; calls: number; tokensIn: number; tokensOut: number }[];   // 這個月
  topUsersToday: { userId: string; name: string; usd: number; calls: number; over: boolean }[];
  alerts: { kind: string; period: string; userId: string; usd: number; thresholdUsd: number; at: string }[];
  blockedToday: number;                                          // 今天用到上限、被暫停 AI 的人數（N7）
}

type Num = string | number | null;
const n = (v: Num) => Number(v ?? 0);

export async function usageSummary(now = Date.now()): Promise<UsageSummary> {
  const today = taipeiDay(now), month = today.slice(0, 7);
  const monthStart = utcText(`${month}-01`), todayStart = utcText(today), since30 = utcText(taipeiDay(now - 29 * 86_400_000));
  const th = await getThresholds();

  const day = sql`to_char((m.created_at::timestamp + interval '8 hours'), 'YYYY-MM-DD')`;
  const daily = await db.execute<{ day: string; c: Num; calls: Num }>(sql`
    select ${day} as day, sum(m.cost_micro_usd) as c, count(*) as calls
    from messages m where m.cost_micro_usd > 0 and m.created_at >= ${since30}
    group by 1 order by 1`);
  const byModel = await db.execute<{ model: string; c: Num; calls: Num; tin: Num; tout: Num }>(sql`
    select coalesce(m.model, '（未記）') as model, sum(m.cost_micro_usd) as c, count(*) as calls, sum(m.tokens_in) as tin, sum(m.tokens_out) as tout
    from messages m where m.cost_micro_usd > 0 and m.created_at >= ${monthStart}
    group by 1 order by 2 desc`);
  const top = await db.execute<{ user_id: string; name: string | null; email: string | null; c: Num; calls: Num }>(sql`
    select c.user_id, u.name, u.email, sum(m.cost_micro_usd) as c, count(*) as calls
    from messages m join conversations c on c.id = m.conversation_id left join users u on u.id = c.user_id
    where m.cost_micro_usd > 0 and m.created_at >= ${todayStart}
    group by 1, 2, 3 order by 4 desc limit 10`);
  const alerts = await db.select().from(usageAlerts).orderBy(sql`${usageAlerts.created_at} desc`).limit(20);
  const [blocked] = await db.select({ c: sql<number>`count(*)::int` }).from(usageAlerts)
    .where(and(eq(usageAlerts.kind, BLOCK_KIND), eq(usageAlerts.period, today)));

  const dailyRows = daily.rows.map(r => ({ day: r.day, usd: usd(n(r.c)), calls: n(r.calls) }));
  const todayRow = dailyRows.find(r => r.day === today);
  const monthRows = dailyRows.filter(r => r.day.startsWith(month));
  // 月初超過 30 天前的部分（30 天圖表外）另外補算
  const monthTotal = monthStart < since30
    ? await db.execute<{ c: Num; calls: Num }>(sql`select sum(cost_micro_usd) as c, count(*) as calls from messages where cost_micro_usd > 0 and created_at >= ${monthStart}`)
    : null;
  return {
    today, month, thresholds: th,
    todayUsd: todayRow?.usd ?? 0, todayCalls: todayRow?.calls ?? 0,
    monthUsd: monthTotal ? usd(n(monthTotal.rows[0]?.c)) : monthRows.reduce((a, r) => a + r.usd, 0),
    monthCalls: monthTotal ? n(monthTotal.rows[0]?.calls) : monthRows.reduce((a, r) => a + r.calls, 0),
    daily: dailyRows,
    byModel: byModel.rows.map(r => ({ model: r.model, usd: usd(n(r.c)), calls: n(r.calls), tokensIn: n(r.tin), tokensOut: n(r.tout) })),
    topUsersToday: top.rows.map(r => ({ userId: r.user_id, name: r.name ?? r.email ?? r.user_id, usd: usd(n(r.c)), calls: n(r.calls), over: usd(n(r.c)) > th.userDailyUsd })),
    blockedToday: blocked?.c ?? 0,
    alerts: alerts.map(a => ({ kind: a.kind, period: a.period, userId: a.user_id, usd: usd(a.amount_micro_usd), thresholdUsd: usd(a.threshold_micro_usd), at: a.created_at })),
  };
}

/** 檢查兩道警報；新觸發的才通知（後台通知＋寄信給所有管理者）。回傳這次新觸發的警報 */
export async function checkAlerts(now = Date.now()): Promise<{ kind: string; period: string; userId: string; usd: number }[]> {
  const today = taipeiDay(now), month = today.slice(0, 7);
  const th = await getThresholds();
  const [m] = (await db.execute<{ c: Num }>(sql`select sum(cost_micro_usd) as c from messages where cost_micro_usd > 0 and created_at >= ${utcText(`${month}-01`)}`)).rows;
  const users = (await db.execute<{ user_id: string; c: Num; test: boolean }>(sql`
    select c.user_id, sum(m.cost_micro_usd) as c, coalesce(bool_or(u.email like '%.invalid'), false) as test
    from messages m join conversations c on c.id = m.conversation_id left join users u on u.id = c.user_id
    where m.cost_micro_usd > 0 and m.created_at >= ${utcText(today)} group by 1 having sum(m.cost_micro_usd) > ${micro(th.userDailyUsd)}`)).rows;

  const candidates = [
    ...(n(m?.c) > micro(th.monthlyBudgetUsd) ? [{ kind: "monthly_budget", period: month, userId: "", amount: n(m?.c), threshold: micro(th.monthlyBudgetUsd) }] : []),
    ...users.map(u => ({ kind: "user_daily", period: today, userId: u.user_id, amount: n(u.c), threshold: micro(th.userDailyUsd), test: u.test })),
  ];
  return recordAlerts(candidates, th);
}

type Candidate = { kind: string; period: string; userId: string; amount: number; threshold: number; test?: boolean };
/** 寫進 usage_alerts（同一期間同一人只一筆）；新寫進的才通知。測試帳號（.invalid，dev-login 建的）只記錄不通知，免得情境測試吵到管理者 */
async function recordAlerts(candidates: Candidate[], th: Thresholds) {
  const fired: { kind: string; period: string; userId: string; usd: number }[] = [];
  const toSend: typeof fired = [];
  for (const c of candidates) {
    const ins = await db.insert(usageAlerts).values({ id: crypto.randomUUID(), kind: c.kind, period: c.period, user_id: c.userId, amount_micro_usd: c.amount, threshold_micro_usd: c.threshold })
      .onConflictDoNothing().returning({ id: usageAlerts.id });
    if (!ins.length) continue;
    const f = { kind: c.kind, period: c.period, userId: c.userId, usd: usd(c.amount) };
    fired.push(f);
    if (!c.test) toSend.push(f);
  }
  if (toSend.length) await sendAlerts(toSend, th);
  return fired;
}

async function sendAlerts(fired: { kind: string; period: string; usd: number }[], th: Thresholds) {
  const admins = await db.select({ id: advisors.id, email: advisors.email }).from(advisors).where(and(eq(advisors.is_admin, 1), eq(advisors.is_active, 1)));
  // 通知與信件只放金額與連結，不放客戶姓名（站內通知原則：點進去、登入、留紀錄才看得到）
  const lines = fired.map(f => f.kind === "monthly_budget"
    ? `${f.period} 的 AI 費用已達 ${f.usd.toFixed(2)} 美元，超過每月預算 ${th.monthlyBudgetUsd} 美元`
    : `有一位使用者 ${f.period} 的 AI 費用 ${f.usd.toFixed(2)} 美元，超過每人每天上限 ${th.userDailyUsd} 美元，今天的 AI 已暫停`);
  const title = fired.some(f => f.kind === "monthly_budget") ? "AI 費用超過每月預算" : "有使用者 AI 用量異常";
  const base = process.env.APP_URL ?? "";
  for (const a of admins) await notify({ type: "advisor", id: a.id }, { kind: "ai_usage_alert", title, body: lines.join("\n"), link: "/admin/monitor" });
  await enqueue(admins.map(a => ({
    to: a.email, kind: "ai_usage_alert", subject: `RADIA｜${title}`,
    html: `<p>${lines.map(l => l.replace(/[<>&]/g, "")).join("<br>")}</p><p>超過單人門檻的使用者，今天的 AI 已先暫停（N7），明天 0 點自動恢復；他之前講的都還在。</p><p><a href="${base}/admin/monitor">打開後台監控</a></p>`,
  })));
}

/*
 * N7 每人用量上限的共用計數（跟上面的單人警報同一個算法）。
 * 諮詢流程在呼叫 AI 前用 capReached() 判斷（接線在 lib/consult/service.ts、衛教 API，屬卡 F）。
 */
export async function userCostToday(userId: string, now = Date.now()): Promise<number> {
  const [r] = (await db.execute<{ c: Num }>(sql`
    select sum(m.cost_micro_usd) as c from messages m join conversations c on c.id = m.conversation_id
    where c.user_id = ${userId} and m.cost_micro_usd > 0 and m.created_at >= ${utcText(taipeiDay(now))}`)).rows;
  return usd(n(r?.c));
}

const BLOCK_KIND = "user_blocked";

/**
 * N7：這位使用者今天的 AI 費用是不是已經超過每人每天上限（＝單人警報門檻）。
 * 超過時記一筆 user_blocked（同一人同一天只記一次，給後台「今天被擋了幾人」），第一次記到就順便檢查警報、通知管理者。
 */
export async function capReached(userId: string, now = Date.now()): Promise<boolean> {
  const [cost, th] = await Promise.all([userCostToday(userId, now), getThresholds()]);
  if (cost <= th.userDailyUsd) return false;
  const ins = await db.insert(usageAlerts).values({ id: crypto.randomUUID(), kind: BLOCK_KIND, period: taipeiDay(now), user_id: userId,
    amount_micro_usd: micro(cost), threshold_micro_usd: micro(th.userDailyUsd) }).onConflictDoNothing().returning({ id: usageAlerts.id });
  // 第一次被擋：只替這個人發單人警報（不掃全站，免得測試把上限調低時一次通知一大堆人）
  if (ins.length) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    await recordAlerts([{ kind: "user_daily", period: taipeiDay(now), userId, amount: micro(cost), threshold: micro(th.userDailyUsd),
      test: /\.invalid$/i.test(u?.email ?? "") }], th).catch(e => console.error("[usage] alert", e));
  }
  return true;
}
