import { desc, eq } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { devFeedback } from "@/lib/schema";

/*
 * 開發版回饋（卡 A 第 4 步，協作規則 §7 校正迴圈）：顧問、門徒在開發版看到問題就按右下角的鈕回報。
 * 只在開發版運作：RADIA_ENV=dev 只設在 Vercel 專案 radia-dev 與本機工作區，上線版沒有 → API 一律 404、按鈕不出現。
 */
export const isDevSite = () => process.env.RADIA_ENV === "dev";

export const KINDS = { broken: "壞掉了", not_wanted: "不是我要的", wording: "文字要改", idea: "想法" } as const;
export const STATUSES = { new: "新", in_progress: "處理中", fixed: "已修待複測", closed: "結案" } as const;
export type Kind = keyof typeof KINDS;
export type Status = keyof typeof STATUSES;

export interface FeedbackRow { id: string; seq: number; kind: Kind; body: string; pageUrl: string; role: string; userName: string | null; status: Status; handlerNote: string | null; createdAt: string; updatedAt: string }

export async function addFeedback(f: { kind: Kind; body: string; pageUrl: string; role: string; userId: string | null; userName: string | null }) {
  const id = crypto.randomUUID();
  await db.insert(devFeedback).values({ id, kind: f.kind, body: f.body, page_url: f.pageUrl, role: f.role, user_id: f.userId, user_name: f.userName });
  const [r] = await db.select({ seq: devFeedback.seq }).from(devFeedback).where(eq(devFeedback.id, id));
  return { id, seq: r.seq };
}

export async function listFeedback(limit = 200): Promise<FeedbackRow[]> {
  const rows = await db.select().from(devFeedback).orderBy(desc(devFeedback.seq)).limit(limit);
  return rows.map(r => ({ id: r.id, seq: r.seq, kind: r.kind as Kind, body: r.body, pageUrl: r.page_url, role: r.role, userName: r.user_name,
    status: r.status as Status, handlerNote: r.handler_note, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function updateFeedback(id: string, p: { status?: Status; handlerNote?: string | null }) {
  await db.update(devFeedback).set({ ...(p.status ? { status: p.status } : {}), ...(p.handlerNote !== undefined ? { handler_note: p.handlerNote } : {}), updated_at: nowText })
    .where(eq(devFeedback.id, id));
}
