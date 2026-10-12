import { and, eq, gt, isNull, lte } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { bookings } from "@/lib/schema";
import { advisorSlotsFor, bookingDetailById, type BookingDetail } from "./service";
import { fmtTaipei } from "./slots";
import { sendBookingEmails } from "./mail";
import { advisorCancelledMails, clientCancelledMails, reminderMails, rescheduledMails } from "./notices";
import { sendNow, enqueue, processOutbox } from "@/lib/notify/outbox";
import { notify } from "@/lib/notify/inbox";
import { viewedSet } from "@/lib/advisor/clients";
import { audit } from "@/lib/consult/gaps";
import { view as passbookView } from "@/lib/passbook/service";

/*
 * 預約之後的生命週期（實作設計 B1、B3、B5；W1b）。
 *
 *   已約 ─┬─ 客戶改期（面談前 2 小時以前）→ 這筆標「已改期」、開一筆新的已約；第 3 次起通知顧問
 *         ├─ 客戶取消（面談前 2 小時以前）
 *         ├─ 顧問取消（必填原因，寫給客戶看）
 *         └─ 已面談／沒出現（顧問標記，在 lib/advisor/clients.ts）
 *
 * 每個動作：改資料庫 → 站內通知 → 寄信（走佇列，寄失敗會重試，不影響動作本身）。
 * 提醒信由排程 runReminders() 寄：面談前一天（雙方）、前 1 小時（客戶）；寄過就記時間，不會重複寄。
 */
export const CHANGE_CUTOFF_MS = 2 * 3600_000;   // B5：2 小時內不能自助改
export class LifecycleError extends Error { constructor(msg: string, public code: string) { super(msg); } }

const clientName = (d: BookingDetail) => d.client.name ?? "客戶";
const toAdvisor = (d: BookingDetail) => ({ type: "advisor" as const, id: d.advisor.id });
const toClient = (d: BookingDetail) => ({ type: "user" as const, id: d.client.id });

async function hasPassbook(userId: string) { return (await passbookView(userId)).upload?.status === "done"; }

/** 預約成立之後：通知顧問＋雙方確認信 */
export async function afterBooked(id: string) {
  const d = await bookingDetailById(id);
  if (!d) return;
  await notify(toAdvisor(d), { kind: "new_booking", title: `新預約：${clientName(d)}・${fmtTaipei(d.startsAt)}`,
    body: (await hasPassbook(d.client.id)) ? "已上傳保險存摺" : "還沒上傳保險存摺", link: `/clients/${d.client.id}`, bookingId: id });
  await sendBookingEmails(d, { hasPassbook: await hasPassbook(d.client.id) });
}

async function ownedChangeable(userId: string, id: string, now: number) {
  const d = await bookingDetailById(id);
  if (!d || d.client.id !== userId) throw new LifecycleError("找不到這筆預約", "not_found");
  if (d.status !== "booked") throw new LifecycleError("這筆預約已經改過或取消了", "not_booked");
  if (Date.parse(d.startsAt) - now < CHANGE_CUTOFF_MS) throw new LifecycleError("面談前 2 小時內不能自己改；臨時有事請直接回覆確認信跟顧問說", "too_late");
  return d;
}

/** 客戶改期：新時段在伺服器端重新驗證；兩人搶同一格由資料庫唯一約束擋 */
export async function rescheduleByClient(userId: string, id: string, input: { startsAt: string; mode?: "online" | "onsite" }, now = Date.now()) {
  const old = await ownedChangeable(userId, id, now);
  const startsAt = new Date(input.startsAt).toISOString();
  if (startsAt === old.startsAt) throw new LifecycleError("這就是原本的時間", "same_slot");
  const mode = input.mode ?? old.mode;
  if (mode === "online" ? !old.advisor.meetingLink : !old.advisor.onsiteLocation) throw new LifecycleError("這位顧問沒有提供這種面談方式", "mode");
  const slot = (await advisorSlotsFor(old.advisor.id, now)).find(s => s.startsAt === startsAt);
  if (!slot) throw new LifecycleError("這個時段剛剛被約走了，請換一個", "slot_taken");
  const newId = crypto.randomUUID(), count = old.rescheduleCount + 1;
  try {
    await db.insert(bookings).values({ id: newId, user_id: userId, advisor_id: old.advisor.id, conversation_id: old.conversationId, starts_at: startsAt, ends_at: slot.endsAt,
      mode, rescheduled_from: old.id, reschedule_count: count });
  } catch (e) {
    if (String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505") throw new LifecycleError("這個時段剛剛被約走了，請換一個", "slot_taken");
    throw e;
  }
  await db.update(bookings).set({ status: "rescheduled", status_by: userId, status_at: nowText, rescheduled_to: newId, updated_at: nowText })
    .where(and(eq(bookings.id, old.id), eq(bookings.status, "booked")));
  const fresh = (await bookingDetailById(newId))!;
  await notify(toAdvisor(fresh), { kind: count >= 3 ? "reschedule_often" : "rescheduled",
    title: `${count >= 3 ? `第 ${count} 次改期` : "客戶改期"}：${clientName(fresh)} 改到 ${fmtTaipei(fresh.startsAt)}`,
    body: `原本 ${fmtTaipei(old.startsAt)}${count >= 3 ? "・可能意願在降，面談前可以先關心一下" : ""}`, link: `/clients/${userId}`, bookingId: newId });
  await sendNow(rescheduledMails(old, fresh, count));
  return { id: newId, rescheduleCount: count };
}

export async function cancelByClient(userId: string, id: string, now = Date.now()) {
  const d = await ownedChangeable(userId, id, now);
  await db.update(bookings).set({ status: "cancelled_by_client", status_by: userId, status_at: nowText, updated_at: nowText })
    .where(and(eq(bookings.id, id), eq(bookings.status, "booked")));
  await notify(toAdvisor(d), { kind: "cancelled_by_client", title: `客戶取消：${clientName(d)}・${fmtTaipei(d.startsAt)}`, body: "這個時段已重新開放", link: `/clients/${userId}`, bookingId: id });
  await sendNow(clientCancelledMails(d));
}

/** 顧問取消：原因必填（會寫給客戶看）；面談開始後就不能取消，改用「沒出現」或「已面談」 */
export async function cancelByAdvisor(advisorId: string, id: string, reason: string, now = Date.now()) {
  const d = await bookingDetailById(id);
  if (!d || d.advisor.id !== advisorId) throw new LifecycleError("找不到這筆預約", "not_found");
  if (d.status !== "booked") throw new LifecycleError("這筆預約已經改過或取消了", "not_booked");
  if (now >= Date.parse(d.startsAt)) throw new LifecycleError("面談時間已經到了，請改標「客戶沒出現」或「已面談」", "started");
  const r = reason.trim();
  if (r.length < 2 || r.length > 200) throw new LifecycleError("請寫取消原因（2–200 字），會寄給客戶看", "reason");
  await db.update(bookings).set({ status: "cancelled_by_advisor", status_by: advisorId, status_at: nowText, cancel_reason: r, updated_at: nowText })
    .where(and(eq(bookings.id, id), eq(bookings.status, "booked")));
  await audit(advisorId, "cancel_booking", d.client.id, "booking", id);
  await notify(toClient(d), { kind: "cancelled_by_advisor", title: `${d.advisor.name} 顧問取消了 ${fmtTaipei(d.startsAt)} 的面談`, body: r, link: "/me", bookingId: id });
  await sendNow(advisorCancelledMails(d, r));
}

/** 客戶的存摺整理好了，而且有約好的顧問 → 通知顧問 */
export async function notifyPassbookReady(userId: string) {
  const [b] = await db.select({ id: bookings.id }).from(bookings)
    .where(and(eq(bookings.user_id, userId), eq(bookings.status, "booked"), gt(bookings.ends_at, new Date().toISOString()))).limit(1);
  if (!b) return;
  const d = (await bookingDetailById(b.id))!;
  await notify(toAdvisor(d), { kind: "passbook_ready", title: `${clientName(d)} 上傳了保險存摺`, body: `面談：${fmtTaipei(d.startsAt)}`, link: `/clients/${userId}`, bookingId: b.id });
}

/**
 * 排程：面談前一天（24 小時內、還有 2 小時以上；預約當下就不到 12 小時的不寄）與前 1 小時（75 分鐘內）的提醒。
 * 先寫「已提醒」再排信——排程重疊執行也不會寄兩次。
 */
export async function runReminders(now = Date.now()): Promise<{ day: number; hour: number }> {
  const iso = (ms: number) => new Date(ms).toISOString();
  let day = 0, hour = 0;
  const dayRows = await db.select({ id: bookings.id, starts: bookings.starts_at, created: bookings.created_at }).from(bookings)
    .where(and(eq(bookings.status, "booked"), isNull(bookings.reminded_24h_at), gt(bookings.starts_at, iso(now + CHANGE_CUTOFF_MS)), lte(bookings.starts_at, iso(now + 24 * 3600_000))));
  for (const r of dayRows) {
    const claimed = await db.update(bookings).set({ reminded_24h_at: nowText }).where(and(eq(bookings.id, r.id), isNull(bookings.reminded_24h_at))).returning({ id: bookings.id });
    if (!claimed.length) continue;
    const createdMs = Date.parse(r.created.replace(" ", "T") + "Z");
    if (Date.parse(r.starts) - createdMs < 12 * 3600_000) continue;   // 才剛約，確認信就是提醒
    const d = (await bookingDetailById(r.id))!;
    const viewed = (await viewedSet(d.advisor.id, [d.client.id])).has(d.client.id);
    await enqueue(reminderMails(d, "24h", { advisorViewed: viewed, hasPassbook: await hasPassbook(d.client.id) }));
    await notify(toAdvisor(d), { kind: "reminder", title: `明天面談：${clientName(d)}・${fmtTaipei(d.startsAt)}`, body: viewed ? null : "你還沒看過這位客戶的諮詢紀錄", link: `/clients/${d.client.id}`, bookingId: r.id });
    day++;
  }
  const hourRows = await db.select({ id: bookings.id }).from(bookings)
    .where(and(eq(bookings.status, "booked"), isNull(bookings.reminded_1h_at), gt(bookings.starts_at, iso(now)), lte(bookings.starts_at, iso(now + 75 * 60_000))));
  for (const r of hourRows) {
    const claimed = await db.update(bookings).set({ reminded_1h_at: nowText }).where(and(eq(bookings.id, r.id), isNull(bookings.reminded_1h_at))).returning({ id: bookings.id });
    if (!claimed.length) continue;
    const d = (await bookingDetailById(r.id))!;
    await enqueue(reminderMails(d, "1h", { advisorViewed: true, hasPassbook: true }));
    hour++;
  }
  return { day, hour };
}

/** 排程入口：提醒 → 把佇列裡該寄的寄掉 */
export async function runBookingCron(now = Date.now()) {
  const reminders = await runReminders(now);
  const outbox = await processOutbox(50, now);
  return { reminders, outbox };
}
