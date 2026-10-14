import { and, eq, gt, isNull, lte } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { bookings } from "@/lib/schema";
import { bookingDetailById } from "@/lib/booking/service";
import { appUrl, esc, layout, MUTED, advisorTitle } from "@/lib/booking/mail";
import { fmtTaipei } from "@/lib/booking/slots";
import { enqueue, type OutMail } from "@/lib/notify/outbox";
import { view as passbookView } from "@/lib/passbook/service";

/*
 * 存摺提醒（W2 w2-06）：預約後 24 小時還沒上傳保險存摺，寄一次提醒（客戶信件版型，lib/booking/mail.ts layout）。
 *   ・只寄一次：先把 bookings.passbook_reminded_at 標上再寄（兩個排程同時跑也不會寄兩封）
 *   ・離面談不到 24 小時就不寄——面談前一天的提醒信已經會叫他上傳，不要連續兩封
 *   ・傳過了（任何狀態，含解析中）就不寄（4-w：不要要求做過的事）
 *   ・手動客戶沒有預約，不會進來；.invalid 信箱寄信佇列也會跳過
 * 掛在 booking-cron（/api/cron/bookings）裡跑，每 10 分鐘一次。
 */
const DAY_MS = 24 * 3600_000;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

export function passbookReminderMail(b: NonNullable<Awaited<ReturnType<typeof bookingDetailById>>>): OutMail {
  const when = fmtTaipei(b.startsAt), adv = advisorTitle(b.advisor.name);
  return {
    to: b.client.email, replyTo: b.advisor.email, kind: "passbook_reminder", bookingId: b.id,
    subject: `面談前，先把保險存摺傳上來？`,
    html: layout({
      title: "先讓顧問看看你的保單",
      preheader: `${when} 跟 ${adv}面談，先上傳保險存摺，當天就能直接談你的保單`,
      rows: [["顧問", esc(b.advisor.name)], ["時間", `${when}<br><span style="color:${MUTED};font-size:13px">約 40 分鐘</span>`]],
      intro: ["面談前把保險存摺傳上來，顧問會先看過你現在有哪些保障，當天就能直接談，不用從頭整理。", "不知道怎麼下載保險存摺也沒關係，上傳頁面有一步一步的說明。"],
      cta: { href: `${appUrl()}/consult`, text: "上傳保險存摺" },
      outro: "不想上傳也可以，面談時再跟顧問說你手上有哪些保險就好。這封提醒只會寄這一次。",
    }),
  };
}

export async function runPassbookReminders(now = Date.now()): Promise<number> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows = await db.select({ id: bookings.id, userId: bookings.user_id }).from(bookings)
    .where(and(eq(bookings.status, "booked"), isNull(bookings.passbook_reminded_at), lte(bookings.created_at, utc(now - DAY_MS)), gt(bookings.starts_at, iso(now + DAY_MS))));
  let sent = 0;
  for (const r of rows) {
    const claimed = await db.update(bookings).set({ passbook_reminded_at: nowText }).where(and(eq(bookings.id, r.id), isNull(bookings.passbook_reminded_at))).returning({ id: bookings.id });
    if (!claimed.length) continue;
    if ((await passbookView(r.userId)).upload) continue;   // 已經傳了（解析中也算）
    const d = await bookingDetailById(r.id);
    if (!d) continue;
    await enqueue([passbookReminderMail(d)]);
    sent++;
  }
  return sent;
}
