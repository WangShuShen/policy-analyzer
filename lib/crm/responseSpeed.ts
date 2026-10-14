import { and, eq, gte, ne, or, isNull } from "drizzle-orm";
import db from "@/lib/db";
import { advisors, auditLogs, bookings } from "@/lib/schema";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * 回應速度（W2 w2-05；顧問 10/14 定案 4-aq）：系統算，顧問不能自己填。
 *   一筆樣本＝客戶在平台預約 → 這位顧問第一次打開他的諮詢紀錄（audit_logs 的 view_conversation），經過多久
 *   ・夜間 23:00～08:00（台灣時間）不算時間——一天的「工作時間」是 15 小時
 *   ・取最近 90 天的預約；顧問一直沒打開、而且已經超過 2 個工作天的，也算一筆（算「很慢」），不然不打開反而不會被扣分
 *   ・客戶在顧問打開前就取消的不算
 *   ・中位數；少於 3 筆顯示「新加入」（保護新人，原型 2389）
 *   ・分段：2 小時內回覆（≤120 分）、當天回覆（≤1 個工作天＝900 分）、2 天內回覆（≤1800 分）；更慢的不顯示標籤
 * 每天由 booking-cron 重算一次（runResponseSpeedDaily），畫面只讀 advisors.response_*。
 */
export const MIN_SAMPLES = 3;
const DAY_ACTIVE = 15 * 60;   // 08:00～23:00

/** 兩個時間點之間的「工作時間」分鐘數（扣掉台灣時間 23:00～08:00） */
export function activeMinutes(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  let total = 0, t = fromMs;
  while (t < toMs) {
    const day = new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
    const open = Date.parse(`${day}T08:00:00+08:00`), close = Date.parse(`${day}T23:00:00+08:00`);
    const s = Math.max(t, open), e = Math.min(toMs, close);
    if (e > s) total += e - s;
    t = Date.parse(`${day}T00:00:00+08:00`) + 86400e3;
  }
  return Math.round(total / 60_000);
}

export function labelOf(medianMin: number | null, samples: number): string | null {
  if (medianMin === null || samples < MIN_SAMPLES) return null;
  if (medianMin <= 120) return "2 小時內回覆";
  if (medianMin <= DAY_ACTIVE) return "當天回覆";
  if (medianMin <= 2 * DAY_ACTIVE) return "2 天內回覆";
  return null;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const ms = (t: string) => Date.parse(t.includes("T") ? t : t.replace(" ", "T") + "Z");

export async function computeResponseSpeed(advisorId: string, now = Date.now()) {
  const since = new Date(now - 90 * 86400e3).toISOString().slice(0, 19).replace("T", " ");
  const bs = await db.select({ user: bookings.user_id, created: bookings.created_at, status: bookings.status, statusAt: bookings.status_at }).from(bookings)
    .where(and(eq(bookings.advisor_id, advisorId), gte(bookings.created_at, since), ne(bookings.status, "rescheduled")));
  const views = await db.select({ u: auditLogs.target_user_id, at: auditLogs.created_at }).from(auditLogs)
    .where(and(eq(auditLogs.actor_id, advisorId), eq(auditLogs.action, "view_conversation"), gte(auditLogs.created_at, since)));
  const samples: number[] = [];
  for (const b of bs) {
    const c = ms(b.created);
    const first = views.filter(v => v.u === b.user && ms(v.at) >= c).map(v => ms(v.at)).sort((a, z) => a - z)[0];
    if (first !== undefined) { samples.push(activeMinutes(c, first)); continue; }
    if (b.status.startsWith("cancelled")) continue;                       // 顧問還沒看就取消了：不算
    const waited = activeMinutes(c, now);
    if (waited > 2 * DAY_ACTIVE) samples.push(waited);                    // 一直沒打開：算很慢
  }
  const med = samples.length ? median(samples) : null;
  return { label: labelOf(med, samples.length), medianMin: med, samples: samples.length };
}

/** 每天重算一次（booking-cron 每 10 分鐘呼叫；今天算過就跳過） */
export async function runResponseSpeedDaily(now = Date.now()): Promise<number> {
  const today = taipeiDay(now);
  const due = await db.select({ id: advisors.id }).from(advisors).where(and(eq(advisors.is_active, 1), or(isNull(advisors.response_on), ne(advisors.response_on, today))));
  for (const a of due) {
    const r = await computeResponseSpeed(a.id, now);
    await db.update(advisors).set({ response_label: r.label, response_median_min: r.medianMin, response_samples: r.samples, response_on: today }).where(eq(advisors.id, a.id));
  }
  return due.length;
}
