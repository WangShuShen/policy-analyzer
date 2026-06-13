import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";
import db, { ensureInit, type FormulaJson } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await ensureInit();

  const result = await db.execute({
    sql: "SELECT formula_json, formula_verified FROM products WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "找不到商品" }, { status: 404 });
  }
  const row = result.rows[0];
  return NextResponse.json({
    formula_json: row.formula_json ? JSON.parse(row.formula_json as string) : null,
    formula_verified: row.formula_verified,
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { id } = await params;
  await ensureInit();

  const body = await req.json() as { formula: FormulaJson };
  if (!body.formula || !Array.isArray(body.formula.items) || body.formula.items.length === 0) {
    return NextResponse.json({ error: "公式格式不正確" }, { status: 400 });
  }

  // Validate each item has required fields
  for (const item of body.formula.items) {
    if (!item.label || !item.type) {
      return NextResponse.json({ error: `給付項目缺少必要欄位：${JSON.stringify(item)}` }, { status: 400 });
    }
  }

  const formulaWithMeta: FormulaJson = {
    ...body.formula,
    filled_by: payload.email as string,
    filled_at: new Date().toISOString(),
  };

  await db.execute({
    sql: "UPDATE products SET formula_json = ?, formula_verified = 1, updated_at = datetime('now') WHERE id = ?",
    args: [JSON.stringify(formulaWithMeta), id],
  });

  return NextResponse.json({ ok: true, formula_verified: 1 });
}
