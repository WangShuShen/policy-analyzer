import { and, desc, eq, gte, inArray } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { advisors, auditLogs, dataRequests, users } from "@/lib/schema";
import { notify } from "@/lib/notify/inbox";
import { enqueue } from "@/lib/notify/outbox";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * 我的資料（4-ap、N5、N21，卡 E）：當事人權利申請的簡單版。
 *   客戶在「我的頁面 → 我的資料」選一種申請、寫一句說明送出 → 建一筆 data_requests、寫稽核、通知管理者（鈴鐺＋信）
 *   管理者在後台標「處理中／已完成」並寫處理說明；實際處理先人工，自動刪除留到 W7
 * 期限：同意書第六條承諾「15 日內處理」。個資法第 13 條是查詢 15 日、更正刪除 30 日（日曆天，可延長一次），我們一律用比較嚴的 15 天。
 * 通知與信件不放個資細節（姓名、信箱、客戶寫的內容），只放申請類別、期限與後台連結。
 */
export class DataRequestError extends Error {}

export const KINDS = {
  access: { label: "查詢我的資料", hint: "想看平台存了我哪些資料，或要一份複本" },
  correct: { label: "更正資料", hint: "哪一筆不對、應該改成什麼" },
  delete: { label: "刪除我的資料／撤回同意", hint: "要全部刪除，還是只刪某一部分；刪除後就不能再看分析結果" },
} as const;
export type Kind = keyof typeof KINDS;
export const STATUS = { received: "已收到", processing: "處理中", done: "已完成" } as const;
export type Status = keyof typeof STATUS;
export const REPLY_DAYS = 15;
const DAILY_LIMIT = 5;

/** 台灣日期加 n 天 */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

async function audit(actorId: string, role: string, action: string, id: string, userId: string) {
  await db.insert(auditLogs).values({ actor_id: actorId, actor_role: role, action, target_user_id: userId, target_type: "data_request", target_id: id });
}

// ── 客戶 ─────────────────────────────────────────────────────────

export async function submitRequest(userId: string, kind: Kind, message: string, now = Date.now()) {
  if (!(kind in KINDS)) throw new DataRequestError("請選一種申請");
  const text = message.trim();
  if (text.length < 2 || text.length > 500) throw new DataRequestError("說明請寫 2～500 字");
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new DataRequestError("找不到你的帳號");
  const since = new Date(now - 86400e3).toISOString().slice(0, 19).replace("T", " ");
  const recent = await db.select({ id: dataRequests.id }).from(dataRequests).where(and(eq(dataRequests.user_id, userId), gte(dataRequests.created_at, since)));
  if (recent.length >= DAILY_LIMIT) throw new DataRequestError("今天已經送出好幾筆了，我們會一起處理，不用再送");

  const id = crypto.randomUUID(), due = addDays(taipeiDay(now), REPLY_DAYS);
  await db.insert(dataRequests).values({ id, user_id: userId, email: u.email, kind, message: text, due_date: due });
  await audit(userId, "customer", "data_request_submit", id, userId);

  // 通知管理者：只放類別與期限（不放姓名、信箱、內容）
  const admins = await db.select({ id: advisors.id, email: advisors.email }).from(advisors).where(and(eq(advisors.is_admin, 1), eq(advisors.is_active, 1)));
  const title = `新的個資申請：${KINDS[kind].label}`;
  const body = `請在 ${due} 前回覆（同意書承諾 ${REPLY_DAYS} 日內）。內容請到後台查看。`;
  for (const a of admins) await notify({ type: "advisor", id: a.id }, { kind: "data_request", title, body, link: "/admin/data-requests" });
  await enqueue(admins.map(a => ({
    to: a.email, kind: "data_request", subject: `RADIA｜${title}`,
    html: `<p>有一位使用者送出了「${KINDS[kind].label}」的申請。</p><p>請在 <b>${due}</b> 前回覆（同意書承諾 ${REPLY_DAYS} 日內處理）。</p><p>申請內容與聯絡方式請登入後台查看：<a href="${process.env.APP_URL ?? ""}/admin/data-requests">個資申請</a></p>`,
  })));
  return { id, due };
}

export async function listMine(userId: string) {
  const rows = await db.select().from(dataRequests).where(eq(dataRequests.user_id, userId)).orderBy(desc(dataRequests.created_at));
  return rows.map(r => ({ id: r.id, kind: r.kind as Kind, message: r.message, status: r.status as Status, due: r.due_date, note: r.handled_note, createdAt: r.created_at, handledAt: r.handled_at }));
}

// ── 管理者 ───────────────────────────────────────────────────────

export async function listAdmin(status?: Status[]) {
  const q = db.select({ r: dataRequests, name: users.name }).from(dataRequests).leftJoin(users, eq(users.id, dataRequests.user_id));
  const rows = await (status?.length ? q.where(inArray(dataRequests.status, status)) : q).orderBy(desc(dataRequests.created_at));
  const names = new Map((await db.select({ id: advisors.id, name: advisors.name }).from(advisors)).map(a => [a.id, a.name]));
  return rows.map(({ r, name }) => ({
    id: r.id, userId: r.user_id, name: name ?? "（帳號已刪除）", email: r.email, kind: r.kind as Kind, message: r.message,
    status: r.status as Status, due: r.due_date, note: r.handled_note, handledBy: r.handled_by ? names.get(r.handled_by) ?? r.handled_by : null,
    handledAt: r.handled_at, createdAt: r.created_at,
  }));
}

/** 管理者打開清單本身也留一筆（看得到客戶姓名、信箱與申請內容，N12） */
export async function auditAdminView(adminId: string) {
  await db.insert(auditLogs).values({ actor_id: adminId, actor_role: "admin", action: "view_data_requests", target_type: "data_request" });
}

export async function updateRequest(adminId: string, id: string, status: Status, note: string) {
  if (!(status in STATUS) || status === "received") throw new DataRequestError("狀態只能改成處理中或已完成");
  const text = note.trim();
  if (status === "done" && text.length < 2) throw new DataRequestError("標已完成要寫處理說明（客戶會看到）");
  if (text.length > 1000) throw new DataRequestError("處理說明 1000 字以內");
  const [r] = await db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1);
  if (!r) throw new DataRequestError("找不到這筆申請");
  if (r.status === "done") throw new DataRequestError("這筆已經完成了");
  await db.update(dataRequests).set({ status, handled_note: text || r.handled_note, handled_by: adminId, handled_at: nowText, updated_at: nowText }).where(eq(dataRequests.id, id));
  await audit(adminId, "admin", `data_request_${status}`, id, r.user_id);
  if (status === "done") {
    await notify({ type: "user", id: r.user_id }, { kind: "data_request_done", title: `你的「${KINDS[r.kind as Kind]?.label ?? "個資"}」申請處理好了`, body: "處理說明在「我的頁面 → 我的資料」。", link: "/me?tab=data" });
  }
}
