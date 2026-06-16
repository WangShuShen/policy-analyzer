import { NextRequest, NextResponse } from "next/server";
import { searchDriveProducts, getDriveCompanies, getDriveCategories } from "@/lib/driveRegistry";
import db, { ensureInit } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    if (action === "meta") {
      return NextResponse.json({
        companies: getDriveCompanies(),
        categories: getDriveCategories(),
      });
    }

    // planCode 查單筆商品 + 已審核分析（給付明細／限制／注意事項）
    const planCode = searchParams.get("planCode");
    if (planCode) {
      await ensureInit();
      const result = await db.execute({
        sql: `SELECT p.id, p.product_name, p.plan_code, p.category, c.name as company
              FROM products p JOIN companies c ON c.id = p.company_id
              WHERE p.plan_code = ?
              ORDER BY p.verified DESC, p.updated_at DESC LIMIT 1`,
        args: [planCode],
      });
      // 已審核分析內容（給付明細／限制／注意事項）
      const pol = await db.execute({
        sql: "SELECT analysis_json, status FROM policies WHERE plan_code = ? AND status = 'archived' ORDER BY archived_at DESC LIMIT 1",
        args: [planCode],
      });
      const analysis = pol.rows[0]?.analysis_json
        ? JSON.parse(pol.rows[0].analysis_json as string)
        : null;

      if (result.rows.length === 0) {
        // products 表沒有，但 policies 可能有已審核分析
        return NextResponse.json({ product: null, analysis });
      }
      const r = result.rows[0];
      return NextResponse.json({
        product: {
          id: r.id,
          product_name: r.product_name,
          plan_code: r.plan_code,
          category: r.category,
          company: r.company,
        },
        analysis,
      });
    }

    // Default: search drive_registry.json in-memory
    const company = searchParams.get("company") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const category = searchParams.get("category") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "1";
    const analyzedOnly = searchParams.get("analyzedOnly") === "1";

    const products = searchDriveProducts({ company, keyword, category, activeOnly });

    // 交叉比對 Turso：標注哪些已審核歸檔
    await ensureInit();
    const archived = await db.execute({
      sql: "SELECT plan_code FROM policies WHERE status = 'archived'",
      args: [],
    });
    const archivedSet = new Set(archived.rows.map(r => r.plan_code as string));
    let annotated = products.map(p => ({ ...p, analyzed: archivedSet.has(p.plan_code) }));
    if (analyzedOnly) annotated = annotated.filter(p => p.analyzed);

    return NextResponse.json({ products: annotated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
