import { NextRequest, NextResponse } from "next/server";
import { searchProducts, getCompanies, getCategories } from "@/lib/policyCache";
import db, { ensureInit } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    if (action === "meta") {
      const [companies, categories] = await Promise.all([getCompanies(), getCategories()]);
      return NextResponse.json({ companies, categories });
    }

    // planCode lookup for formula editor
    const planCode = searchParams.get("planCode");
    if (planCode) {
      await ensureInit();
      const result = await db.execute({
        sql: `SELECT p.id, p.product_name, p.plan_code, p.category, p.formula_json, p.formula_verified, c.name as company
              FROM products p JOIN companies c ON c.id = p.company_id
              WHERE p.plan_code = ?
              ORDER BY p.verified DESC, p.updated_at DESC LIMIT 1`,
        args: [planCode],
      });
      if (result.rows.length === 0) return NextResponse.json({ product: null });
      const r = result.rows[0];
      return NextResponse.json({
        product: {
          id: r.id,
          product_name: r.product_name,
          plan_code: r.plan_code,
          category: r.category,
          company: r.company,
          formula_json: r.formula_json ? JSON.parse(r.formula_json as string) : null,
          formula_verified: r.formula_verified,
        },
      });
    }

    const company = searchParams.get("company") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const category = searchParams.get("category") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "1";

    const products = await searchProducts({ company, keyword, category, activeOnly });
    return NextResponse.json({ products });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
