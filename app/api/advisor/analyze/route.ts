import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import db from "@/lib/db";
import { policies } from "@/lib/schema";
import { requireAdvisor } from "@/lib/auth";
import { enqueue, listMine, resultOf } from "@/lib/advisor/analysisQueue";
import { catalog } from "@/lib/passbook/catalog";
import { buildFxGrid } from "@/lib/advisor/fxgrid";
import type { AnalysisJson } from "@/lib/passbook/coverage";

/*
 * 保單分析（原型 SCREENS.advanalyze）：單張商品 → 十格全險圖。整份存摺的解析從客戶頁進（2026-10-08 收斂）。
 *   mode=db：資料庫已收錄 → 套已審核（或 AI 讀過待審）的給付公式，幾秒
 *   資料庫沒有這張 → 上傳條款 PDF，排進 skill 批次分析佇列（2026-10-12 顧問：不現場花 API，一樣排隊）
 *   GET ?id= 看某一筆的結果；GET 沒帶 id → 我送出的分析清單
 */

const Held = z.object({ amount: z.number().positive().nullable().optional(), unit: z.string().max(10).nullable().optional(), plan: z.string().max(20).nullable().optional() });
const heldOf = (h: z.infer<typeof Held>) => ({ amount: h.amount ?? null, unit: h.unit ?? null, plan: h.plan ?? null });

export async function POST(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const body = z.object({ planCode: z.string().min(3) }).and(Held).safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
    const p = catalog().find(x => x.planCode === body.data.planCode);
    if (!p) return NextResponse.json({ error: "資料庫沒有這個商品" }, { status: 404 });
    const rows = await db.select({ status: policies.status, analysis_json: policies.analysis_json }).from(policies)
      .where(and(eq(policies.plan_code, p.planCode), isNotNull(policies.analysis_json), inArray(policies.status, ["archived", "uploaded"])))
      .orderBy(desc(policies.updated_at));
    const best = rows.find(r => r.status === "archived") ?? rows[0];
    if (!best) return NextResponse.json({ error: "這張商品資料庫有收錄，但條款還沒分析——請改用「資料庫沒有這張」上傳條款", code: "no_formula" }, { status: 409 });
    const aj = JSON.parse(best.analysis_json!) as AnalysisJson;
    return NextResponse.json({
      mode: "db", reviewed: best.status === "archived", company: p.company, productName: p.productName, planCode: p.planCode,
      productType: p.productType, contractType: p.contractType, period: `${p.saleDate ?? "?"} ～ ${p.stopDate ?? "現售"}`,
      baseUnit: aj.baseUnit ?? null, plans: aj.plans ?? [], grid: buildFxGrid(aj, heldOf(body.data), p.productType),
    });
  }

  // 資料庫沒有這張：上傳條款 PDF → 排隊
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "請上傳條款 PDF" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "檔案太大（上限 25MB）" }, { status: 400 });
  const held = Held.safeParse({ amount: fd!.get("amount") ? Number(fd!.get("amount")) : null, unit: (fd!.get("unit") as string) || null, plan: (fd!.get("plan") as string) || null });
  if (!held.success) return NextResponse.json({ error: "保額格式不正確" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 4).toString("latin1") !== "%PDF") return NextResponse.json({ error: "這個檔案不是 PDF" }, { status: 400 });
  const { item, ahead } = await enqueue(a.advisorId, file.name, buf, heldOf(held.data));
  return NextResponse.json({ mode: "queued", item, ahead });
}

export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id) return NextResponse.json({ items: await listMine(a.advisorId) });
  const amount = sp.get("amount") ? Number(sp.get("amount")) : undefined;
  const r = await resultOf(a.advisorId, id, { amount: amount && amount > 0 ? amount : undefined, unit: sp.get("unit") ?? undefined, plan: sp.get("plan") ?? undefined });
  return r ? NextResponse.json(r) : NextResponse.json({ error: "這筆還沒分析好" }, { status: 404 });
}
