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

// 把保額單位金額化（萬 → ×10000；其餘視為已是元）
function unitToYuan(amount: number, unit: string): number {
  return unit.includes("萬") ? amount * 10000 : amount;
}

function calcItem(item: FormulaItem, amount: number, baseUnit: string, plan?: string): TrialResult {
  const limit = item.limit
    ? [item.limit.days ? `年度最高 ${item.limit.days} 天` : "", item.limit.times ? `最多 ${item.limit.times} 次` : ""]
        .filter(Boolean).join("、")
    : "";
  const note = item.note ?? "";

  // 金額顯示（item.unit 含「萬」則以萬顯示，否則元）
  const fmt = (yuan: number) =>
    item.unit?.includes("萬") ? `${formatAmount(Math.round(yuan / 10000 * 100) / 100)} 萬` : `${formatAmount(Math.round(yuan))} 元`;

  // 以新格式 value_source 為主
  if (item.value_source) {
    switch (item.value_source) {
      case "plan": {
        const v = plan != null ? item.plan_values?.[plan] : undefined;
        return { label: item.label, type: "plan", display: v != null ? fmt(v) : "（請選計劃別）", limit, note };
      }
      case "table": {
        const lo = item.table_range?.min ?? 0, hi = item.table_range?.max ?? 0;
        return { label: item.label, type: "table",
          display: lo === hi ? fmt(lo) : `${fmt(lo)} ～ ${fmt(hi)}`, limit, note: note || "依附表項別核給" };
      }
      case "insured": {
        const base = unitToYuan(amount, baseUnit);
        const r = item.insured_rate;
        const mul = (x?: number) => r?.type === "percentage" ? (x ?? 0) / 100 : (x ?? 0);
        if (r?.min != null && r?.max != null) {
          const rd = r.type === "percentage" ? `${r.min}%～${r.max}%` : `${r.min}倍～${r.max}倍`;
          return { label: item.label, type: "insured",
            display: `${fmt(base * mul(r.min))} ～ ${fmt(base * mul(r.max))}（${rd}）`, limit, note };
        }
        return { label: item.label, type: "insured", display: fmt(base * mul(r?.rate ?? 1)), limit, note };
      }
      case "reimbursement": {
        // 限額＝保額(投保限額)×倍率；顯示為「實支實付，上限 X」
        const base = unitToYuan(amount, baseUnit);
        const r = item.insured_rate;
        const mul = (x?: number) => r?.type === "percentage" ? (x ?? 0) / 100 : (x ?? 0);
        if (r?.min != null && r?.max != null) {
          const rd = r.type === "percentage" ? `${r.min}%～${r.max}%` : `${r.min}倍～${r.max}倍`;
          return { label: item.label, type: "reimbursement",
            display: `實支實付，上限 ${fmt(base * mul(r.min))} ～ ${fmt(base * mul(r.max))}（${rd}）`, limit, note };
        }
        return { label: item.label, type: "reimbursement",
          display: `實支實付，上限 ${fmt(base * mul(r?.rate ?? 1))}`, limit, note };
      }
      case "fixed":
        return { label: item.label, type: "fixed", display: fmt(item.amount ?? 0), limit, note };
    }
  }

  // ── legacy fallback（舊 type 格式）──
  const planVal = plan != null && item.plan_values ? item.plan_values[plan] : undefined;
  const hasPlan = planVal != null;
  switch (item.type) {
    case "fixed":
    case "multiplier": {
      const val = hasPlan && item.type === "fixed" ? planVal! : amount * (hasPlan ? planVal! : (item.multiplier ?? 1));
      return { label: item.label, type: item.type, display: `${formatAmount(Math.round(val))} 元`, limit, note };
    }
    case "lump_sum": {
      const val = hasPlan ? planVal! : amount * (item.multiplier ?? 1);
      return { label: item.label, type: item.type, display: `${formatAmount(Math.round(val))} 元`, limit: "一次性給付", note };
    }
    case "reimbursement": {
      const cap = hasPlan ? planVal! : amount * (item.multiplier ?? 1);
      return { label: item.label, type: item.type, display: `實支實付，上限 ${formatAmount(Math.round(cap))} 元`, limit, note };
    }
    case "range": {
      const isPct = item.rate_type === "percentage";
      const mn = Math.round(amount * (item.min_rate ?? 0) / (isPct ? 100 : 1));
      const mx = Math.round(amount * (item.max_rate ?? 0) / (isPct ? 100 : 1));
      const rd = isPct ? `${item.min_rate}%～${item.max_rate}%` : `${item.min_rate}倍～${item.max_rate}倍`;
      return { label: item.label, type: item.type, display: `${formatAmount(mn)} 元 ～ ${formatAmount(mx)} 元（${rd}）`, limit, note: note || "依手術類別核給" };
    }
    default:
      return { label: item.label, type: item.type ?? "fixed", display: "—", limit, note };
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  await ensureInit();

  const body = await req.json() as { insured_amount: number; unit: string; plan?: string };
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
  const results: TrialResult[] = formula.items.map(item => calcItem(item, body.insured_amount, body.unit ?? formula.base_unit ?? "元", body.plan));

  return NextResponse.json({
    product_name: row.product_name,
    company: row.company,
    category: row.category,
    insured_amount: body.insured_amount,
    unit: body.unit ?? formula.base_unit,
    plan: body.plan,
    plans: formula.plans ?? [],
    results,
  });
}
