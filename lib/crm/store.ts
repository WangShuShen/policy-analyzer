import { and, desc, eq, isNull } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { advisorClients, auditLogs, bookings, clientInteractions, todoStates, users } from "@/lib/schema";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * W2 顧問的客戶管理（卡 D；4-e B 級）：顧問↔客戶關係、互動紀錄、下次追蹤、首頁待辦的延後／關掉。
 * 範圍刻意小：不做保全、續期、理賠、轉介紹、業績報表。
 * 每個會改資料的動作都寫稽核（actor_role=advisor）；查看沿用 W1 既有的稽核（view_client／view_conversation）。
 */
export class CrmError extends Error {}

export const KINDS = { meeting: "面談", proposal: "提案", call: "電話", note: "備註" } as const;
export type InteractionKind = keyof typeof KINDS;
export const OUTCOMES = { open: "進行中", won: "已成交", lost: "沒成" } as const;
export type Outcome = keyof typeof OUTCOMES;
// 關掉待辦的原因（原型 advhome 2669；存起來之後給產能儀表板）
export const DISMISS_REASONS = ["已經處理了", "客戶不回應", "客戶說不需要", "約不到時間", "其他"] as const;
export const SNOOZES = ["1 小時後", "今天晚上", "明天", "下週"] as const;

/** 延後選項 → 到期時間（台灣時間：今天晚上＝20:00、明天＝明早 9:00、下週＝下週一 9:00） */
export function snoozeUntil(opt: string, now = Date.now()): number {
  const tw = new Date(now + 8 * 3600e3), day = tw.toISOString().slice(0, 10);
  const at = (d: string, h: number) => Date.parse(`${d}T${String(h).padStart(2, "0")}:00:00+08:00`);
  const plus = (n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
  if (opt === "1 小時後") return now + 3600e3;
  if (opt === "今天晚上") return at(day, 20) > now + 30 * 60e3 ? at(day, 20) : now + 3600e3;
  if (opt === "明天") return at(plus(1), 9);
  if (opt === "下週") { const dow = tw.getUTCDay(); return at(plus(((8 - dow) % 7) || 7), 9); }
  throw new CrmError("延後選項不對");
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function audit(advisorId: string, action: string, userId: string, targetId: string | null = null) {
  await db.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action, target_user_id: userId, target_type: "client", target_id: targetId });
}

// ── 顧問↔客戶關係（w2-01）──────────────────────────────────────

/** 平台預約自動變成客戶：把這位顧問所有預約過的客戶補進 advisor_clients（已有就不動）。清單與待辦打開時呼叫 */
export async function ensurePlatformClients(advisorId: string) {
  const rows = await db.selectDistinct({ u: bookings.user_id }).from(bookings).where(eq(bookings.advisor_id, advisorId));
  if (!rows.length) return;
  await db.insert(advisorClients).values(rows.map(r => ({ id: crypto.randomUUID(), advisor_id: advisorId, user_id: r.u, source: "platform" })))
    .onConflictDoNothing();
}

export async function relation(advisorId: string, userId: string) {
  const [r] = await db.select().from(advisorClients).where(and(eq(advisorClients.advisor_id, advisorId), eq(advisorClients.user_id, userId))).limit(1);
  return r ?? null;
}

/** 這位顧問能不能看這位客戶：有預約過，或是他手動建的 */
export async function isMyClient(advisorId: string, userId: string): Promise<boolean> {
  if (await relation(advisorId, userId)) return true;
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.advisor_id, advisorId), eq(bookings.user_id, userId))).limit(1);
  return !!b;
}

async function mustRelation(advisorId: string, userId: string) {
  if (!(await isMyClient(advisorId, userId))) throw new CrmError("這不是你的客戶");
  await db.insert(advisorClients).values({ id: crypto.randomUUID(), advisor_id: advisorId, user_id: userId, source: "platform" }).onConflictDoNothing();
  return (await relation(advisorId, userId))!;
}

// ── 下次追蹤、成交／沒成（w2-02）────────────────────────────────

export async function setFollowUp(advisorId: string, userId: string, day: string | null, note?: string | null) {
  if (day !== null && !DAY.test(day)) throw new CrmError("日期格式要是 YYYY-MM-DD");
  if ((note ?? "").length > 200) throw new CrmError("追蹤說明 200 字以內");
  const r = await mustRelation(advisorId, userId);
  await db.update(advisorClients).set({ follow_up_on: day, follow_up_note: day ? note?.trim() || null : null, updated_at: nowText }).where(eq(advisorClients.id, r.id));
  await audit(advisorId, day ? "set_follow_up" : "clear_follow_up", userId, day);
}

export async function setOutcome(advisorId: string, userId: string, outcome: Outcome, note?: string | null) {
  if (!(outcome in OUTCOMES)) throw new CrmError("結果不對");
  const text = note?.trim() ?? "";
  if (outcome !== "open" && text.length < 2) throw new CrmError(outcome === "won" ? "寫一下成交了什麼（例：醫療實支＋失能）" : "寫一下沒成的原因");
  if (text.length > 200) throw new CrmError("200 字以內");
  const r = await mustRelation(advisorId, userId);
  await db.update(advisorClients).set({ outcome, outcome_note: outcome === "open" ? null : text, updated_at: nowText }).where(eq(advisorClients.id, r.id));
  await audit(advisorId, `set_outcome_${outcome}`, userId);
}

// ── 互動紀錄（w2-02）──────────────────────────────────────────

export async function addInteraction(advisorId: string, userId: string, kind: InteractionKind, day: string, summary: string) {
  if (!(kind in KINDS)) throw new CrmError("類型不對");
  if (!DAY.test(day)) throw new CrmError("日期格式要是 YYYY-MM-DD");
  if (day > taipeiDay(Date.now())) throw new CrmError("還沒發生的事請用「下次追蹤日」");
  const text = summary.trim();
  if (text.length < 2 || text.length > 1000) throw new CrmError("摘要 2～1000 字");
  await mustRelation(advisorId, userId);
  const id = crypto.randomUUID();
  await db.insert(clientInteractions).values({ id, advisor_id: advisorId, user_id: userId, kind, happened_on: day, summary: text });
  await audit(advisorId, `add_interaction_${kind}`, userId, id);
  return id;
}

export async function deleteInteraction(advisorId: string, userId: string, id: string) {
  const [r] = await db.select().from(clientInteractions)
    .where(and(eq(clientInteractions.id, id), eq(clientInteractions.advisor_id, advisorId), eq(clientInteractions.user_id, userId), isNull(clientInteractions.deleted_at))).limit(1);
  if (!r) throw new CrmError("找不到這筆紀錄");
  await db.update(clientInteractions).set({ deleted_at: nowText }).where(eq(clientInteractions.id, id));
  await audit(advisorId, "delete_interaction", userId, id);
}

export async function listInteractions(advisorId: string, userId: string) {
  const rows = await db.select().from(clientInteractions)
    .where(and(eq(clientInteractions.advisor_id, advisorId), eq(clientInteractions.user_id, userId), isNull(clientInteractions.deleted_at)))
    .orderBy(desc(clientInteractions.happened_on), desc(clientInteractions.created_at));
  return rows.map(r => ({ id: r.id, kind: r.kind as InteractionKind, day: r.happened_on, summary: r.summary, createdAt: r.created_at }));
}

/** 每位客戶最後一次互動的日期（清單的「最後動作」） */
export async function lastInteractionDays(advisorId: string): Promise<Map<string, string>> {
  const rows = await db.select({ u: clientInteractions.user_id, d: clientInteractions.happened_on }).from(clientInteractions)
    .where(and(eq(clientInteractions.advisor_id, advisorId), isNull(clientInteractions.deleted_at)));
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.u) || r.d > m.get(r.u)!) m.set(r.u, r.d);
  return m;
}

// ── 首頁待辦的延後／關掉（w2-03）─────────────────────────────────

export type TodoState = { snoozedUntil: string | null; dismissedAt: string | null; reason: string | null };

export async function todoStatesOf(advisorId: string): Promise<Map<string, TodoState>> {
  const rows = await db.select().from(todoStates).where(eq(todoStates.advisor_id, advisorId));
  return new Map(rows.map(r => [r.key, { snoozedUntil: r.snoozed_until, dismissedAt: r.dismissed_at, reason: r.dismiss_reason }]));
}

/** 這件待辦現在要不要顯示 */
export const hidden = (s: TodoState | undefined, now = Date.now()) =>
  !!s && (!!s.dismissedAt || (!!s.snoozedUntil && Date.parse(s.snoozedUntil.replace(" ", "T") + "Z") > now));

const KEY = /^[a-z_]+:[\w-]+(:[\w-]+)?$/;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

export async function snoozeTodo(advisorId: string, key: string, untilMs: number, now = Date.now()) {
  if (!KEY.test(key)) throw new CrmError("待辦不對");
  if (untilMs <= now || untilMs > now + 60 * 86400e3) throw new CrmError("延後要在 60 天內");
  await db.insert(todoStates).values({ advisor_id: advisorId, key, snoozed_until: utc(untilMs) })
    .onConflictDoUpdate({ target: [todoStates.advisor_id, todoStates.key], set: { snoozed_until: utc(untilMs), dismissed_at: null, dismiss_reason: null, updated_at: nowText } });
  await db.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action: "snooze_todo", target_type: "todo", target_id: key });
}

export async function dismissTodo(advisorId: string, key: string, reason: string) {
  if (!KEY.test(key)) throw new CrmError("待辦不對");
  if (!(DISMISS_REASONS as readonly string[]).includes(reason)) throw new CrmError("請選一個關掉的原因");
  await db.insert(todoStates).values({ advisor_id: advisorId, key, dismissed_at: nowText, dismiss_reason: reason })
    .onConflictDoUpdate({ target: [todoStates.advisor_id, todoStates.key], set: { dismissed_at: nowText, dismiss_reason: reason, snoozed_until: null, updated_at: nowText } });
  await db.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action: "dismiss_todo", target_type: "todo", target_id: key });
}

/** 還原（「本次已處理」裡按還原） */
export async function restoreTodo(advisorId: string, key: string) {
  await db.delete(todoStates).where(and(eq(todoStates.advisor_id, advisorId), eq(todoStates.key, key)));
  await db.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action: "restore_todo", target_type: "todo", target_id: key });
}

// ── 手動建立客戶（w2-01、4-f；4-aq：影子帳號＋顧問勾同意）─────────────────

export const MANUAL_DOMAIN = "clients.invalid";   // 保留網域：不能登入（Google 不會有這個信箱）、寄信佇列也會跳過
export const isManualEmail = (email: string) => email.endsWith(`@${MANUAL_DOMAIN}`);

/**
 * 自己談來的客戶（4-f 硬需求）：建一個影子帳號（.invalid 信箱，不能登入、不收信），存摺、分析的程式照用。
 * 顧問必須勾「我已取得客戶同意，將他的保單資料提供給 RADIA 分析」才能建（N4、N21；4-aq），記下誰、何時，寫稽核。
 */
export async function createManualClient(advisorId: string, input: { name: string; phone?: string | null; note?: string | null; consent: boolean }) {
  if (!input.consent) throw new CrmError("要先取得客戶同意，並勾選確認，才能建立");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) throw new CrmError("姓名 1～40 字");
  const phone = input.phone?.trim() || null;
  if (phone && !/^[\d+\-()\s]{6,20}$/.test(phone)) throw new CrmError("電話格式不對");
  if ((input.note ?? "").length > 500) throw new CrmError("備註 500 字以內");
  const userId = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(users).values({ id: userId, email: `manual-${userId}@${MANUAL_DOMAIN}`, name });
    await tx.insert(advisorClients).values({ id: crypto.randomUUID(), advisor_id: advisorId, user_id: userId, source: "manual", phone, note: input.note?.trim() || null,
      consent_by: advisorId, consent_at: nowText });
    await tx.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action: "create_manual_client", target_user_id: userId, target_type: "client" });
    await tx.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action: "attest_client_consent", target_user_id: userId, target_type: "client" });
  });
  return userId;
}

/** 手動客戶的資料（姓名、電話、備註）可以改；平台客戶的姓名來自他自己的帳號，不給改 */
export async function updateManualClient(advisorId: string, userId: string, input: { name: string; phone?: string | null; note?: string | null }) {
  const r = await relation(advisorId, userId);
  if (!r || r.source !== "manual") throw new CrmError("只有自己建的客戶可以改資料");
  const name = input.name.trim(), phone = input.phone?.trim() || null;
  if (name.length < 1 || name.length > 40) throw new CrmError("姓名 1～40 字");
  if (phone && !/^[\d+\-()\s]{6,20}$/.test(phone)) throw new CrmError("電話格式不對");
  await db.update(users).set({ name }).where(eq(users.id, userId));
  await db.update(advisorClients).set({ phone, note: input.note?.trim() || null, updated_at: nowText }).where(eq(advisorClients.id, r.id));
  await audit(advisorId, "update_manual_client", userId);
}

/** 這位顧問所有的客戶關係（清單、待辦用） */
export async function relationsOf(advisorId: string) {
  return db.select().from(advisorClients).where(eq(advisorClients.advisor_id, advisorId));
}
