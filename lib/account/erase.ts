import { and, eq, gt, inArray, isNull, like, notInArray, or, sql } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import {
  advisorClients, advisors, aiUsage, analysisSnapshots, auditLogs, bookings, clientPolicies, consents, conversations, dataRequests,
  emailOutbox, loginEvents, messages, notifications, passbookUploads, presence, todoStates, usageCounters, users,
} from "@/lib/schema";
import { decryptJson } from "@/lib/fieldCrypto";
import { bookingDetailById, type BookingDetail } from "@/lib/booking/service";
import { appUrl, esc, layout } from "@/lib/booking/mail";
import { fmtTaipei } from "@/lib/booking/slots";
import { advisorCancelIcs } from "@/lib/booking/notices";
import { deliver, enqueue, type OutMail } from "@/lib/notify/outbox";

/*
 * 客戶自己刪存摺／刪帳號（4-aw，盤點定案見 100_Todo/projects/RADIA-派工/4-aw-刪除盤點.md）。按下去馬上生效、不能復原。
 *
 * 刪存摺：存摺內容＋讀出的保單＋輸入裡有存摺保額的分析快照（下次打開會照對話重算）。顧問改過的缺口分級、對話不動。
 * 刪帳號，順序有講究：
 *   1. 還沒到的預約改「客戶取消」→ 先寄信給有關係的顧問（預約過或在客戶管理裡的，就算沒有未來預約也寄；信裡只寫姓名）
 *   2. 一個交易裡：AI 費用加總記進 ai_usage（不然後台這個月的費用會變少）、同意紀錄摘要與「刪除帳號」記進稽核（只有編號）、
 *      個資申請去識別化保留、清掉沒跟帳號連在一起的表（通知、寄信紀錄、用量計數、在線、登入紀錄、待辦），最後刪 users
 *      ——其餘的表（對話、需求點、快照、存摺、保單、預約、規劃書、客戶管理、互動紀錄、開啟追蹤…）資料庫會連帶刪除
 *   3. 寄確認信給客戶；寄出後連這封的寄信紀錄也刪掉
 * 手動客戶（顧問建的影子帳號）不能登入，不會走到這裡。
 */
export class EraseError extends Error {}

const DELETED = "（帳號已刪除）";
const isSent = (s: string) => s === "sent" || s === "skipped";

/** 寄掉、回傳寄出的那幾封的 id（寄不出去的留在佇列給排程重試，不刪） */
async function sendAndReport(mails: OutMail[]): Promise<{ sent: string[]; pending: string[] }> {
  const ids = await enqueue(mails);
  await deliver(ids);
  if (!ids.length) return { sent: [], pending: [] };
  const rows = await db.select({ id: emailOutbox.id, status: emailOutbox.status }).from(emailOutbox).where(inArray(emailOutbox.id, ids));
  return { sent: rows.filter(r => isSent(r.status)).map(r => r.id), pending: rows.filter(r => !isSent(r.status)).map(r => r.id) };
}

// ── 刪存摺 ───────────────────────────────────────────────────────

export async function deletePassbook(userId: string): Promise<{ uploads: number; policies: number; snapshots: number }> {
  const ups = await db.select({ id: passbookUploads.id }).from(passbookUploads).where(eq(passbookUploads.user_id, userId));
  if (!ups.length) throw new EraseError("你還沒有上傳保險存摺");
  const snaps = await db.select({ id: analysisSnapshots.id, inputs: analysisSnapshots.inputs_enc }).from(analysisSnapshots).where(eq(analysisSnapshots.user_id, userId));
  const withPassbook = snaps.filter(s => {
    try { return (decryptJson<Record<string, unknown>>(s.inputs) ?? {}).lifeCoverExisting != null; } catch { return false; }
  }).map(s => s.id);
  return db.transaction(async tx => {
    const pol = await tx.delete(clientPolicies).where(eq(clientPolicies.user_id, userId)).returning({ id: clientPolicies.id });
    const up = await tx.delete(passbookUploads).where(eq(passbookUploads.user_id, userId)).returning({ id: passbookUploads.id });
    if (withPassbook.length) await tx.delete(analysisSnapshots).where(inArray(analysisSnapshots.id, withPassbook));
    // 剛刪完就寄「記得上傳存摺」很怪：還沒到的預約把存摺提醒標成已處理
    await tx.update(bookings).set({ passbook_reminded_at: "skipped:passbook-deleted" })
      .where(and(eq(bookings.user_id, userId), eq(bookings.status, "booked"), isNull(bookings.passbook_reminded_at)));
    await tx.insert(auditLogs).values({ actor_id: userId, actor_role: "customer", action: "delete_passbook", target_user_id: userId, target_type: "passbook", target_id: null });
    return { uploads: up.length, policies: pol.length, snapshots: withPassbook.length };
  });
}

// ── 刪帳號 ───────────────────────────────────────────────────────

/** 給顧問的「客戶刪除了帳號」：只寫姓名；有取消的未來預約就列時間並附日曆取消檔 */
export function accountDeletedAdvisorMail(to: string, clientName: string, cancelled: BookingDetail[]): OutMail {
  const name = clientName || "一位客戶";
  return {
    to, kind: "client_deleted", subject: `客戶刪除了帳號：${name}`,
    html: layout({
      title: "客戶刪除了帳號", preheader: cancelled.length ? `${name} 刪除了帳號，${cancelled.length} 場面談已取消` : `${name} 刪除了帳號`,
      rows: [["客戶", esc(name)], ...cancelled.map(b => ["已取消的面談", `<s>${fmtTaipei(b.startsAt)}</s>`] as [string, string])],
      intro: [`${esc(name)} 在 RADIA 刪除了自己的帳號。這位客戶的對話、分析、保險存摺、規劃書和你的客戶管理紀錄都已經從平台刪除，客戶清單裡不會再看到。`],
      outro: cancelled.length ? "取消的時段已經重新開放給其他客戶預約。" : undefined,
      foot: cancelled.length ? ["附件會把這幾場面談從你的日曆移除。"] : undefined,
    }),
    ics: cancelled.map(advisorCancelIcs),
  };
}

export function accountDeletedClientMail(to: string, cancelledCount: number): OutMail {
  return {
    to, kind: "account_deleted", subject: "你的 RADIA 帳號已經刪除",
    html: layout({
      title: "你的帳號已經刪除", preheader: "你在 RADIA 的資料都已經刪除",
      intro: [
        "你在 RADIA 的帳號和資料（諮詢對話、分析、保險存摺、預約）都已經刪除，顧問那邊也看不到了。<b>系統備份會在 30 天內自動清除。</b>",
        ...(cancelledCount ? [`還沒到的 ${cancelledCount} 場面談已經幫你取消，也通知了顧問。`] : []),
        "之後想再用 RADIA，用同一個 Google 帳號登入，會是一個全新的帳號。",
      ],
      cta: { href: `${appUrl()}/welcome`, text: "回到 RADIA" },
    }),
  };
}

export async function deleteAccount(userId: string, now = Date.now()): Promise<{ cancelled: number; advisorsNotified: number }> {
  const [u] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new EraseError("找不到你的帳號");

  // 1. 還沒到的預約 → 客戶取消；有關係的顧問先寄信
  const future = await db.update(bookings).set({ status: "cancelled_by_client", status_by: userId, status_at: nowText, cancel_reason: "客戶刪除了帳號", updated_at: nowText })
    .where(and(eq(bookings.user_id, userId), eq(bookings.status, "booked"), gt(bookings.starts_at, new Date(now).toISOString())))
    .returning({ id: bookings.id, advisorId: bookings.advisor_id });
  const details = (await Promise.all(future.map(f => bookingDetailById(f.id)))).filter((d): d is BookingDetail => !!d);
  const advIds = new Set<string>([
    ...(await db.selectDistinct({ id: bookings.advisor_id }).from(bookings).where(eq(bookings.user_id, userId))).map(r => r.id),
    ...(await db.selectDistinct({ id: advisorClients.advisor_id }).from(advisorClients).where(eq(advisorClients.user_id, userId))).map(r => r.id),
  ]);
  const advs = advIds.size ? await db.select({ id: advisors.id, email: advisors.email }).from(advisors).where(inArray(advisors.id, [...advIds])) : [];
  const advMail = await sendAndReport(advs.map(a => accountDeletedAdvisorMail(a.email, u.name, details.filter(d => d.advisor.id === a.id))));

  // 2. 記帳、去識別化、刪除（一個交易）
  const allBookingIds = (await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.user_id, userId))).map(r => r.id);
  await db.transaction(async tx => {
    // AI 費用：照模型、日期加總，不帶編號（後台月費用與警報才不會因為刪資料變少）
    const cost = await tx.select({
      model: messages.model, day: sql<string>`substr(${messages.created_at}, 1, 10)`, at: sql<string>`max(${messages.created_at})`,
      tin: sql<number>`coalesce(sum(${messages.tokens_in}), 0)::int`, tout: sql<number>`coalesce(sum(${messages.tokens_out}), 0)::int`,
      micro: sql<number>`coalesce(sum(${messages.cost_micro_usd}), 0)::bigint`,
    }).from(messages).innerJoin(conversations, eq(messages.conversation_id, conversations.id))
      .where(and(eq(conversations.user_id, userId), sql`${messages.cost_micro_usd} > 0`))
      .groupBy(messages.model, sql`substr(${messages.created_at}, 1, 10)`);
    if (cost.length) await tx.insert(aiUsage).values(cost.map(c => ({
      id: crypto.randomUUID(), kind: "consult_erased", ref_id: null, user_id: null, model: c.model ?? "unknown",
      tokens_in: Number(c.tin), tokens_out: Number(c.tout), cost_micro_usd: Number(c.micro), created_at: c.at,
    })));

    // 稽核：同意紀錄摘要（同意書版本｜範圍｜同意時間｜撤回時間）＋刪除帳號；只有編號
    const cs = await tx.select().from(consents).where(eq(consents.user_id, userId));
    const audit = (action: string, targetType: string, targetId: string | null) =>
      ({ actor_id: userId, actor_role: "customer", action, target_user_id: userId, target_type: targetType, target_id: targetId });
    await tx.insert(auditLogs).values([
      ...cs.map(c => audit("consent_record", "consent", [c.doc_version, c.scope, c.granted_at, c.withdrawn_at ?? ""].join("|"))),
      audit("delete_account", "user", null),
    ]);

    // 個資申請：留類別、日期、狀態（證明 15 日內處理），信箱與內容去掉；還沒處理完的標已完成
    await tx.update(dataRequests).set({ email: DELETED, message: DELETED, updated_at: nowText }).where(eq(dataRequests.user_id, userId));
    await tx.update(dataRequests).set({ status: "done", handled_note: "客戶已自行刪除帳號", handled_at: nowText, updated_at: nowText })
      .where(and(eq(dataRequests.user_id, userId), sql`${dataRequests.status} <> 'done'`));

    // 沒跟帳號連在一起的表
    await tx.delete(notifications).where(or(eq(notifications.recipient_id, userId), allBookingIds.length ? inArray(notifications.booking_id, allBookingIds) : sql`false`));
    const keep = advMail.pending;   // 寄給顧問、還在等重試的那幾封不能刪
    await tx.delete(emailOutbox).where(and(
      or(eq(emailOutbox.to_addr, u.email), allBookingIds.length ? inArray(emailOutbox.booking_id, allBookingIds) : sql`false`, advMail.sent.length ? inArray(emailOutbox.id, advMail.sent) : sql`false`),
      keep.length ? notInArray(emailOutbox.id, keep) : sql`true`));
    await tx.delete(usageCounters).where(eq(usageCounters.user_id, userId));
    await tx.delete(presence).where(eq(presence.actor_id, userId));
    await tx.delete(loginEvents).where(eq(loginEvents.actor_id, userId));
    await tx.delete(todoStates).where(like(todoStates.key, `%${userId}%`));

    // 最後刪帳號：其餘的表資料庫連帶刪除（ON DELETE CASCADE）
    await tx.delete(users).where(eq(users.id, userId));
  });

  // 3. 確認信；寄出後這封的紀錄也刪（裡面有信箱）
  const done = await sendAndReport([accountDeletedClientMail(u.email, details.length)]);
  if (done.sent.length) await db.delete(emailOutbox).where(inArray(emailOutbox.id, done.sent));
  return { cancelled: details.length, advisorsNotified: advMail.sent.length + advMail.pending.length };
}
