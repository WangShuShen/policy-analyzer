import db, { nowText } from "@/lib/db";
import { auditLogs, bookings, conversations, users } from "@/lib/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getFacts, getMessages, titleOf, type StoredFact, type StoredMessage } from "@/lib/consult/store";
import { view as passbookView } from "@/lib/passbook/service";
import { buildAnalysis, publicView, type AnalysisView } from "@/lib/consult/analysis";
import { audit, computeGapsForUser } from "@/lib/consult/gaps";
import { STEPS } from "@/lib/consult/script";
import type { FinalGapRow } from "@/lib/calc/gaps";

/*
 * 顧問端：我的客戶與客戶頁（W1a；B1、D4、4-ah、N8、N12）。
 *
 * 顧問只看得到「有預約自己」的客戶（應用層隔離，設計準則 §1）。
 * 看得到完整對話與需求點摘要（D4），但不能匯出（N8）；每次查看都寫稽核（N12）。
 * 解鎖的開關在顧問手上：標「已面談」客戶端才解鎖，預約不算（4-ah）。
 */

export type ClientGroup = "todo" | "upcoming" | "met" | "closed";
export const GROUP_LABEL: Record<ClientGroup, string> = { todo: "等我處理", upcoming: "進行中", met: "已面談", closed: "沒出現／取消" };

export interface ClientRow {
  userId: string; name: string; group: ClientGroup; status: string; when: string; source: string;
  bookingId: string; startsAt: string;
}

const UNMARKED_AFTER_MS = 12 * 3600_000;      // B1：面談結束 12 小時還沒標記 → 待辦

/** 這位顧問看過哪些客戶的諮詢紀錄（未讀＝待辦，B3） */
export async function viewedSet(advisorId: string, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db.select({ u: auditLogs.target_user_id }).from(auditLogs)
    .where(and(eq(auditLogs.actor_id, advisorId), eq(auditLogs.action, "view_conversation"), inArray(auditLogs.target_user_id, userIds)));
  return new Set(rows.map(r => r.u!).filter(Boolean));
}

export async function listClients(advisorId: string, now = Date.now()): Promise<ClientRow[]> {
  const rows = await db.select({ b: bookings, name: users.name, email: users.email }).from(bookings)
    .innerJoin(users, eq(users.id, bookings.user_id))
    .where(eq(bookings.advisor_id, advisorId)).orderBy(desc(bookings.starts_at));
  // 每位客戶只看最近一筆預約
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.b.status !== "rescheduled" && !latest.has(r.b.user_id)) latest.set(r.b.user_id, r);   // 改期的舊預約不算，看新的那筆
  const viewed = await viewedSet(advisorId, [...latest.keys()]);
  const out: ClientRow[] = [];
  for (const [userId, r] of latest) {
    const b = r.b, start = Date.parse(b.starts_at), end = Date.parse(b.ends_at);
    let group: ClientGroup, status: string;
    if (b.status === "met") { group = "met"; status = "已面談・客戶端已解鎖"; }
    else if (b.status !== "booked") { group = "closed"; status = b.status === "no_show" ? "客戶沒出現" : b.status === "cancelled_by_client" ? "客戶取消了" : b.status === "cancelled_by_advisor" ? "你取消了" : "已取消"; }
    else if (now > end + UNMARKED_AFTER_MS) { group = "todo"; status = "面談完結果還沒記錄"; }
    else if (now > end) { group = "todo"; status = "面談結束了，記得標記結果"; }
    else if (!viewed.has(userId)) { group = "todo"; status = "還沒看諮詢紀錄"; }
    else { group = "upcoming"; status = start - now < 86_400_000 ? "快到了，面談前再看一次" : "已約好"; }
    out.push({ userId, name: r.name ?? r.email, group, status, when: b.starts_at, source: "AI 諮詢進線", bookingId: b.id, startsAt: b.starts_at });
  }
  const order: ClientGroup[] = ["todo", "upcoming", "met", "closed"];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.startsAt.localeCompare(b.startsAt));
}

export async function advisorHasClient(advisorId: string, userId: string): Promise<boolean> {
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.advisor_id, advisorId), eq(bookings.user_id, userId))).limit(1);
  return !!b;
}

const labelOf = (key: string) => {
  for (const s of STEPS) if (s.t === "ask" && s.keys.includes(key)) return s.o.find(o => o.key === key)?.label ?? key;
  return key;
};

export interface ClientDetail {
  user: { id: string; name: string; email: string; joinedAt: string };
  bookings: { id: string; startsAt: string; endsAt: string; mode: string; status: string; statusAt: string | null }[];
  conversations: { id: string; title: string; status: string; lastActiveAt: string }[];
  facts: (StoredFact & { label: string })[];
  care: string | null;                         // 「她在意的是」：來意或最先講的那件事
  passbook: Omit<Awaited<ReturnType<typeof passbookView>>, "stuck" | "lifeCover">;
  gaps: FinalGapRow[] | null;
}

/** 客戶頁。呼叫端先確認 advisorHasClient；這裡負責寫稽核 */
export async function clientDetail(advisorId: string, userId: string): Promise<ClientDetail | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const bs = await db.select().from(bookings).where(and(eq(bookings.user_id, userId), eq(bookings.advisor_id, advisorId))).orderBy(desc(bookings.starts_at));
  const convs = await db.select().from(conversations).where(eq(conversations.user_id, userId)).orderBy(desc(conversations.last_active_at));
  // 需求點：所有對話合併，同一項取最新（客戶可能聊了好幾次）
  const byKey = new Map<string, StoredFact>();
  for (const c of [...convs].reverse()) {
    for (const f of await getFacts(c.id)) byKey.set(f.key, f);
  }
  const facts = [...byKey.values()].map(f => ({ ...f, label: labelOf(f.key) }));
  const { stuck: _s, lifeCover: _l, ...pb } = await passbookView(userId);
  await audit(advisorId, "view_client", userId, "client");
  return {
    user: { id: u.id, name: u.name ?? u.email, email: u.email, joinedAt: u.created_at },
    bookings: bs.map(b => ({ id: b.id, startsAt: b.starts_at, endsAt: b.ends_at, mode: b.mode, status: b.status, statusAt: b.status_at })),
    conversations: convs.map(c => ({ id: c.id, title: c.title ?? titleOf(c.branch, c.sub_route), status: c.status, lastActiveAt: c.last_active_at })),
    facts, care: (byKey.get("care") ?? byKey.get("intent"))?.display ?? null,
    passbook: pb, gaps: await computeGapsForUser(userId),
  };
}

/** 完整對話（唯讀）。查看即寫稽核；用來判斷「還沒看諮詢紀錄」 */
export async function clientConversation(advisorId: string, userId: string, convId: string): Promise<StoredMessage[] | null> {
  const [c] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.user_id, userId))).limit(1);
  if (!c) return null;
  await audit(advisorId, "view_conversation", userId, "conversation", convId);
  return getMessages(convId);
}

// ── 面談結果（B1）──────────────────────────────────────────────

export class MarkError extends Error {}
export type MarkAction = "met" | "no_show" | "undo";

/**
 * 已面談 → 客戶端解鎖；沒出現 → 維持鎖住；標錯了 → 改回已約（撤銷寫稽核）。
 * 面談開始前不能標已面談／沒出現——預約不等於說明真的發生了。
 */
export async function markBooking(advisorId: string, bookingId: string, action: MarkAction, now = Date.now()) {
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.advisor_id, advisorId))).limit(1);
  if (!b) throw new MarkError("找不到這筆預約");
  if (action === "undo") {
    if (b.status !== "met" && b.status !== "no_show") throw new MarkError("這筆沒有可以撤銷的標記");
  } else {
    if (b.status !== "booked") throw new MarkError("這筆已經標記過了；標錯的話先撤銷");
    if (now < Date.parse(b.starts_at) - 15 * 60_000) throw new MarkError("面談還沒開始，不能先標記結果");
  }
  const status = action === "undo" ? "booked" : action;
  await db.update(bookings).set({ status, status_by: advisorId, status_at: nowText, updated_at: nowText }).where(eq(bookings.id, bookingId));
  await audit(advisorId, action === "undo" ? `undo_${b.status}` : `mark_${action}`, b.user_id, "booking", bookingId);
  return { userId: b.user_id, status };
}


const FINANCE = ["route", "exp", "retgap", "taxest", "proc", "taxsrc", "survgap", "xfer", "edugap"];

/**
 * 財務試算：逐段對話各算一份，用那段對話自己的需求點——跟客戶在「我的分析」看那段對話時的數字完全相同
 * （W1a 完成定義：客戶端與顧問端數字一致）。顧問看完整版，不受客戶端的鎖影響。
 */
export async function clientFinance(userId: string, convId: string): Promise<AnalysisView | null> {
  const [c] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, convId), eq(conversations.user_id, userId))).limit(1);
  if (!c) return null;
  const shown = (await getMessages(convId)).flatMap(m => m.content.kind === "panel" ? [m.content.key] : []).filter(k => FINANCE.includes(k));
  const { stuck: _s, ...pb } = await passbookView(userId);
  return publicView(await buildAnalysis(userId, await getFacts(convId), shown, true, pb, { forAdvisor: true }));
}
