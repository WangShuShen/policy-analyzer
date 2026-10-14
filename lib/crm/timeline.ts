import { and, desc, eq, isNull } from "drizzle-orm";
import db from "@/lib/db";
import { advisorClients, bookings, clientInteractions, passbookUploads, viewEvents } from "@/lib/schema";
import { KINDS, type InteractionKind } from "./store";

/*
 * 客戶頁「時間軸」（原型 advclient 3318）：預約、面談結果、互動紀錄、客戶上傳存摺、客戶打開我的分析，依時間排。
 * who：advisor＝顧問做的事，customer＝客戶做的事（畫面用不同顏色）。
 */
export interface TimelineItem { at: string; who: "advisor" | "customer"; text: string }
const utcIso = (s: string) => s.includes("T") ? s : s.replace(" ", "T") + "Z";
const STATUS: Record<string, string> = { met: "標記已面談（客戶端解鎖）", no_show: "標記客戶沒出現", cancelled_by_client: "客戶取消了面談", cancelled_by_advisor: "你取消了面談", rescheduled: "面談改期了" };

export async function timeline(advisorId: string, userId: string): Promise<TimelineItem[]> {
  const out: TimelineItem[] = [];
  const [rel] = await db.select().from(advisorClients).where(and(eq(advisorClients.advisor_id, advisorId), eq(advisorClients.user_id, userId))).limit(1);
  if (rel?.source === "manual") out.push({ at: utcIso(rel.created_at), who: "advisor", text: "你手動建立這位客戶（已勾選取得客戶同意）" });
  for (const b of await db.select().from(bookings).where(and(eq(bookings.advisor_id, advisorId), eq(bookings.user_id, userId)))) {
    const when = new Date(b.starts_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    out.push({ at: utcIso(b.created_at), who: "customer", text: `在平台預約了 ${when} 的面談（${b.mode === "online" ? "線上" : "面對面"}）` });
    if (b.status_at && STATUS[b.status]) out.push({ at: utcIso(b.status_at), who: b.status.startsWith("cancelled_by_client") ? "customer" : "advisor", text: STATUS[b.status] });
  }
  for (const i of await db.select().from(clientInteractions).where(and(eq(clientInteractions.advisor_id, advisorId), eq(clientInteractions.user_id, userId), isNull(clientInteractions.deleted_at))))
    out.push({ at: `${i.happened_on}T12:00:00+08:00`, who: "advisor", text: `${KINDS[i.kind as InteractionKind] ?? i.kind}：${i.summary}` });
  for (const u of await db.select({ at: passbookUploads.created_at }).from(passbookUploads).where(eq(passbookUploads.user_id, userId)))
    out.push({ at: utcIso(u.at), who: rel?.source === "manual" ? "advisor" : "customer", text: rel?.source === "manual" ? "你幫客戶上傳了保險存摺" : "上傳了保險存摺" });
  for (const v of await db.select().from(viewEvents).where(and(eq(viewEvents.user_id, userId), eq(viewEvents.page, "analysis"))).orderBy(desc(viewEvents.created_at)).limit(30)) {
    const ms = v.duration_ms ?? 0;
    out.push({ at: utcIso(v.created_at), who: "customer", text: `打開了「我的分析」${ms >= 60_000 ? `，看了 ${Math.round(ms / 60_000)} 分鐘` : ms > 0 ? "，看了不到 1 分鐘" : ""}` });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** 客戶打開某一頁的統計（客戶頁摘要用；W4 規劃書用 page="plan"） */
export async function viewStats(userId: string, page = "analysis") {
  const rows = await db.select().from(viewEvents).where(and(eq(viewEvents.user_id, userId), eq(viewEvents.page, page))).orderBy(desc(viewEvents.created_at));
  if (!rows.length) return null;
  const per = new Map<string, number>();
  for (const r of rows) { try { for (const s of JSON.parse(r.sections ?? "[]") as { key: string; ms: number }[]) per.set(s.key, (per.get(s.key) ?? 0) + s.ms); } catch { /* 略過壞資料 */ } }
  const top = [...per].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { count: rows.length, last: utcIso(rows[0].created_at), totalMs: rows.reduce((t, r) => t + (r.duration_ms ?? 0), 0), top };
}
