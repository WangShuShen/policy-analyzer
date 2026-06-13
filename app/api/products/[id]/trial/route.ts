import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";
import db, { ensureInit, type FormulaJson, type FormulaItem } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

interface TrialResult {
  label: string;
  type: string;
  display: string;
  limit: string;
  note: string;
}

function formatAmount(n: number): string {
  return n.toLocaleString("zh-TW");
}

function calcItem(item: FormulaItem, amount: number): TrialResult {
  const limit = item.limit
    ? [item.limit.days ? `年度最高 ${item.limit.days} 天` : "", item.limit.times ? `最多 ${item.limit.times} 次` : ""]
        .filter(Boolean).join("、")
    : "";

  switch (item.type) {
    case "fixed":
    case "multiplier": {
      const val = Math.round(amount * (item.multiplier ?? 1));
      return { label: item.label, type: item.type, display: `${formatAmount(val)} 元`, limit, note: item.note ?? "" };
    }
    case "lump_sum": {
      const val = Math.round(amount * (item.multiplier ?? 1));
      return { label: item.label, type: item.type, display: `${formatAmount(val)} 元`, limit: "一次性給付", note: item.note ?? "" };
    }
    case "reimbursement": {
      const cap = Math.round(amount * (item.multiplier ?? 1));
      return { label: item.label, type: item.type, display: `實支實付，上限 ${formatAmount(cap)} 元`, limit, note: item.note ?? "" };
    }
    case "range": {
      const isPercent = item.rate_type === "percentage";
      const minVal = isPercent
        ? Math.round(amount * (item.min_rate ?? 0) / 100)
        : Math.round(amount * (item.min_rate ?? 0));
      const maxVal = isPercent
        ? Math.round(amount * (item.max_rate ?? 0) / 100)
        : Math.round(amount * (item.max_rate ?? 0));
      const rateDisplay = isPercent
        ? `${item.min_rate}%～${item.max_rate}%`
        : `${item.min_rate}倍～${item.max_rate}倍`;
      return {
        label: item.label,
        type: item.type,
        display: `${formatAmount(minVal)} 元 ～ ${formatAmount(maxVal)} 元（${rateDisplay}）`,
        limit,
        note: item.note ?? "依手術類別核給",
      };
    }
    default:
      return { label: item.label, type: item.type, display: "—", limit, note: "" };
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  await ensureInit();

  const body = await req.json() as { insured_amount: number; unit: string };
  if (!body.insured_amount || body.insured_amount <= 0) {
    return NextResponse.json({ error: "請輸入有效的保額" }, { status: 400 });
  }

  const result = await db.execute({
    sql: `SELECT p.product_name, p.category, p.formula_json, p.formula_verified, c.name as company
          FROM products p JOIN companies c ON c.id = p.company_id
          WHERE p.id = ?`,
    args: [id],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "找不到商品" }, { status: 404 });
  }

  const row = result.rows[0];
  if (!row.formula_verified || !row.formula_json) {
    return NextResponse.json({ error: "此商品的給付公式尚未設定" }, { status: 422 });
  }

  const formula = JSON.parse(row.formula_json as string) as FormulaJson;
  const results: TrialResult[] = formula.items.map(item => calcItem(item, body.insured_amount));

  return NextResponse.json({
    product_name: row.product_name,
    company: row.company,
    category: row.category,
    insured_amount: body.insured_amount,
    unit: body.unit ?? formula.base_unit,
    results,
  });
}
