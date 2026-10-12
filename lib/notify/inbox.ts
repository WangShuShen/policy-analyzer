import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { notifications } from "@/lib/schema";

/*
 * 站內通知（W1b）：顧問右上角的鈴鐺、客戶「我的頁面」。
 * 只放短標題與連結——點進去才看得到內容，而且要登入、查閱留紀錄（N8、N12）。
 */
export type Recipient = { type: "advisor" | "user"; id: string };
export interface Notice { id: string; kind: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string }

export async function notify(to: Recipient, n: { kind: string; title: string; body?: string | null; link?: string | null; bookingId?: string | null }) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(), recipient_type: to.type, recipient_id: to.id, kind: n.kind, title: n.title,
    body: n.body ?? null, link: n.link ?? null, booking_id: n.bookingId ?? null,
  });
}

export async function inbox(to: Recipient, limit = 30): Promise<{ items: Notice[]; unread: number }> {
  const rows = await db.select().from(notifications)
    .where(and(eq(notifications.recipient_type, to.type), eq(notifications.recipient_id, to.id)))
    .orderBy(desc(notifications.seq)).limit(limit);
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications)
    .where(and(eq(notifications.recipient_type, to.type), eq(notifications.recipient_id, to.id), isNull(notifications.read_at)));
  return {
    items: rows.map(r => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, read: !!r.read_at, createdAt: r.created_at })),
    unread: c?.n ?? 0,
  };
}

/** 標成已讀：給 ids 就只標那幾則，沒給就全部 */
export async function markRead(to: Recipient, ids?: string[]) {
  const base = and(eq(notifications.recipient_type, to.type), eq(notifications.recipient_id, to.id), isNull(notifications.read_at));
  await db.update(notifications).set({ read_at: nowText })
    .where(ids?.length ? and(base, inArray(notifications.id, ids)) : base);
}
