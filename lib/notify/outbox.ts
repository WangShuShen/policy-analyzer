import nodemailer from "nodemailer";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { emailOutbox } from "@/lib/schema";

/*
 * 寄信佇列（實作設計 B3、設計準則 T7）：信先寫進 email_outbox 再寄。
 * 當下就試寄一次；失敗的由排程（/api/cron/bookings）重試，間隔 1 分 → 5 分 → 30 分 → 2 小時，第 5 次還失敗就標 failed，
 * 後台監控看得到哪幾封寄不出去。寄信成功與否從不影響預約本身。
 */
export interface IcsFile { filename: string; content: string; method: "PUBLISH" | "CANCEL" }
export interface OutMail { to: string; replyTo?: string | null; subject: string; html: string; ics?: IcsFile[]; kind: string; bookingId?: string | null }
type Sender = (m: { from: string; to: string; replyTo?: string; subject: string; html: string; attachments: { filename: string; content: string; contentType: string }[] }) => Promise<unknown>;

const BACKOFF_MIN = [1, 5, 30, 120];
const MAX_ATTEMPTS = 5;
let sender: Sender | null = null;
/** 測試用：換掉真的寄信 */
export function setSenderForTest(s: Sender | null) { sender = s; }
function send(): Sender {
  if (sender) return sender;
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  return m => t.sendMail(m);
}

export async function enqueue(mails: OutMail[]): Promise<string[]> {
  const rows = mails.filter(m => m.to).map(m => ({
    id: crypto.randomUUID(), to_addr: m.to, reply_to: m.replyTo ?? null, subject: m.subject, html: m.html,
    ics: m.ics?.length ? JSON.stringify(m.ics) : null, kind: m.kind, booking_id: m.bookingId ?? null,
  }));
  if (rows.length) await db.insert(emailOutbox).values(rows);
  return rows.map(r => r.id);
}

async function deliverOne(row: typeof emailOutbox.$inferSelect): Promise<boolean> {
  const files = row.ics ? (JSON.parse(row.ics) as IcsFile[]) : [];
  try {
    await send()({
      from: `RADIA <${process.env.GMAIL_USER}>`, to: row.to_addr, replyTo: row.reply_to ?? undefined, subject: row.subject, html: row.html,
      attachments: files.map(f => ({ filename: f.filename, content: f.content, contentType: `text/calendar; charset=utf-8; method=${f.method}` })),
    });
    await db.update(emailOutbox).set({ status: "sent", attempts: row.attempts + 1, sent_at: nowText, last_error: null }).where(eq(emailOutbox.id, row.id));
    return true;
  } catch (e) {
    const attempts = row.attempts + 1;
    const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    await db.update(emailOutbox).set({
      attempts, last_error: String((e as Error)?.message ?? e).slice(0, 500),
      status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
      next_try_at: new Date(Date.now() + wait * 60_000).toISOString(),
    }).where(eq(emailOutbox.id, row.id));
    console.error("[outbox] send failed", row.id, row.kind, attempts);
    return false;
  }
}

/** 寄指定的幾封（剛排進來的，當下試一次） */
export async function deliver(ids: string[]): Promise<number> {
  let ok = 0;
  for (const id of ids) {
    const [row] = await db.select().from(emailOutbox).where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "queued"))).limit(1);
    if (row && await deliverOne(row)) ok++;
  }
  return ok;
}

/** 排程用：把到時間該重試的寄掉 */
export async function processOutbox(limit = 30, now = Date.now()): Promise<{ sent: number; failed: number }> {
  const rows = await db.select().from(emailOutbox)
    .where(and(eq(emailOutbox.status, "queued"), or(isNull(emailOutbox.next_try_at), lte(emailOutbox.next_try_at, new Date(now).toISOString()))))
    .orderBy(asc(emailOutbox.created_at)).limit(limit);
  let sent = 0, failed = 0;
  for (const r of rows) (await deliverOne(r)) ? sent++ : failed++;
  return { sent, failed };
}

/** 排進佇列並馬上試寄 */
export async function sendNow(mails: OutMail[]): Promise<void> {
  await deliver(await enqueue(mails));
}
