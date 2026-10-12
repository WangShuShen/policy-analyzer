import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import db from "@/lib/db";
import { policies } from "@/lib/schema";
import { requireAdvisor } from "@/lib/auth";
import { analyzePolicyPdf } from "@/lib/analyzeEngine";
import { catalog } from "@/lib/passbook/catalog";
import { buildFxGrid } from "@/lib/advisor/fxgrid";
import type { AnalysisJson } from "@/lib/passbook/coverage";

/*
 * 保單分析（原型 SCREENS.advanalyze）：單張商品 → 十格全險圖。整份存摺的解析從客戶頁進（2026-10-08 收斂）。
 *   mode=db：資料庫已收錄 → 套已審核（或 AI 讀過待審）的給付公式，幾秒
 *   mode=ai：資料庫沒有這張 → 上傳條款 PDF，AI 讀完再套（約 40 秒）；結果標「AI 讀出來的，還沒入庫」
 */
export const maxDuration = 300;

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

  // mode=ai：上傳條款 PDF
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "請上傳條款 PDF" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "檔案太大（上限 25MB）" }, { status: 400 });
  const held = Held.safeParse({ amount: fd!.get("amount") ? Number(fd!.get("amount")) : null, unit: (fd!.get("unit") as string) || null, plan: (fd!.get("plan") as string) || null });
  if (!held.success) return NextResponse.json({ error: "保額格式不正確" }, { status: 400 });
  const amountText = held.data.amount ? `${held.data.amount}${held.data.unit ?? ""}` : undefined;
  const { data, category } = await analyzePolicyPdf(Buffer.from(await file.arrayBuffer()).toString("base64"), amountText);
  const aj = data as AnalysisJson & { company?: string; productName?: string };
  if (!Array.isArray(aj.items)) return NextResponse.json({ error: "AI 沒有讀出給付項目，請確認上傳的是條款 PDF" }, { status: 422 });
  return NextResponse.json({
    mode: "ai", reviewed: false, company: aj.company ?? "", productName: aj.productName ?? file.name.replace(/\.pdf$/i, ""), planCode: null,
    productType: category, contractType: null, period: null, baseUnit: aj.baseUnit ?? null, plans: aj.plans ?? [],
    grid: buildFxGrid(aj, heldOf(held.data), category),
  });
}
