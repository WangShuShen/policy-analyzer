import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import db from "@/lib/db";
import { analysisRequests } from "@/lib/schema";
import { buildFxGrid, type FxGrid } from "./fxgrid";
import type { AnalysisJson, Held } from "@/lib/passbook/coverage";

/*
 * 「資料庫沒有這張」的條款分析佇列（2026-10-12 顧問：一樣需要排隊）。
 * 顧問上傳 → 存進 analysis_requests（queued）→ scripts/skill-fetch.mjs 取件 → Claude Code 用訂閱額度分析
 * → scripts/skill-save.mjs 寫回（done，pdf 清掉）→ 顧問在保單分析頁「我送出的分析」看結果。
 */
export interface QueueItem { id: string; filename: string; status: "queued" | "done" | "failed"; productName: string | null; company: string | null; createdAt: string; doneAt: string | null; note: string | null }
export interface QueueResult { mode: "ai"; reviewed: false; company: string; productName: string; planCode: null; productType: string | null; contractType: null; period: null; baseUnit: string | null; plans: string[]; grid: FxGrid; held: Held }

const toItem = (r: typeof analysisRequests.$inferSelect): QueueItem => ({
  id: r.id, filename: r.filename, status: r.status as QueueItem["status"], productName: r.product_name, company: r.company, createdAt: r.created_at, doneAt: r.done_at, note: r.note,
});

/** 排進佇列。同一份 PDF 已經分析過（誰送的都一樣）→ 直接沿用結果；這位顧問已經排過 → 回同一筆 */
export async function enqueue(advisorId: string, filename: string, pdf: Buffer, held: Held): Promise<{ item: QueueItem; ahead: number }> {
  const sha = createHash("sha256").update(pdf).digest("hex");
  const [done] = await db.select().from(analysisRequests).where(and(eq(analysisRequests.pdf_sha256, sha), eq(analysisRequests.status, "done"))).orderBy(desc(analysisRequests.done_at)).limit(1);
  const [mine] = await db.select().from(analysisRequests).where(and(eq(analysisRequests.pdf_sha256, sha), eq(analysisRequests.advisor_id, advisorId), eq(analysisRequests.status, "queued"))).limit(1);
  if (mine) return { item: toItem(mine), ahead: await aheadOf(mine.created_at) };
  const id = randomUUID();
  const base = { id, advisor_id: advisorId, filename, pdf_sha256: sha, held: JSON.stringify(held) };
  if (done) {
    await db.insert(analysisRequests).values({ ...base, status: "done", company: done.company, product_name: done.product_name, category: done.category, result_json: done.result_json, done_at: done.done_at, note: "同一份條款已分析過，直接沿用" });
  } else {
    await db.insert(analysisRequests).values({ ...base, pdf });
  }
  const [row] = await db.select().from(analysisRequests).where(eq(analysisRequests.id, id));
  return { item: toItem(row), ahead: row.status === "queued" ? await aheadOf(row.created_at) : 0 };
}

async function aheadOf(createdAt: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(analysisRequests).where(and(eq(analysisRequests.status, "queued"), lt(analysisRequests.created_at, createdAt)));
  return r?.n ?? 0;
}

export async function listMine(advisorId: string): Promise<QueueItem[]> {
  const rows = await db.select({
    id: analysisRequests.id, filename: analysisRequests.filename, status: analysisRequests.status, product_name: analysisRequests.product_name, company: analysisRequests.company,
    created_at: analysisRequests.created_at, done_at: analysisRequests.done_at, note: analysisRequests.note,
  }).from(analysisRequests).where(eq(analysisRequests.advisor_id, advisorId)).orderBy(desc(analysisRequests.created_at)).limit(20);
  return rows.map(r => ({ id: r.id, filename: r.filename, status: r.status as QueueItem["status"], productName: r.product_name, company: r.company, createdAt: r.created_at, doneAt: r.done_at, note: r.note }));
}

/** 分析好的結果套上保額（沒給就用送出時填的）→ 十格全險圖 */
export async function resultOf(advisorId: string, id: string, override?: Partial<Held>): Promise<QueueResult | null> {
  const [r] = await db.select().from(analysisRequests).where(and(eq(analysisRequests.id, id), eq(analysisRequests.advisor_id, advisorId))).limit(1);
  if (!r || r.status !== "done" || !r.result_json) return null;
  const aj = JSON.parse(r.result_json) as AnalysisJson & { company?: string; productName?: string };
  const saved = (r.held ? JSON.parse(r.held) : {}) as Held;
  const held: Held = { amount: override?.amount ?? saved.amount ?? null, unit: override?.unit ?? saved.unit ?? null, plan: override?.plan ?? saved.plan ?? null };
  return {
    mode: "ai", reviewed: false, company: r.company ?? aj.company ?? "", productName: r.product_name ?? aj.productName ?? r.filename.replace(/\.pdf$/i, ""), planCode: null,
    productType: r.category, contractType: null, period: null, baseUnit: aj.baseUnit ?? null, plans: aj.plans ?? [], grid: buildFxGrid(aj, held, r.category), held,
  };
}
