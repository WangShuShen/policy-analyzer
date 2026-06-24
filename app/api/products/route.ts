import { NextRequest, NextResponse } from "next/server";
import { searchDriveProducts, getDriveCompanies, getDriveCategories } from "@/lib/driveRegistry";
import { getDocIds } from "@/lib/driveIndex";
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
      // 已審核分析內容（給付明細／限制／注意事項）+ Drive PDF 來源
      const pol = await db.execute({
        sql: "SELECT analysis_json, status, pdf_drive_id FROM policies WHERE plan_code = ? AND status = 'archived' ORDER BY archived_at DESC LIMIT 1",
        args: [planCode],
      });
      const analysis = pol.rows[0]?.analysis_json
        ? JSON.parse(pol.rows[0].analysis_json as string)
        : null;
      // 三種文件 Drive ID：條款優先用 policies.pdf_drive_id，否則退回索引 clauseId
      const docIds = getDocIds(planCode);
      const pdfDriveId = (pol.rows[0]?.pdf_drive_id as string | null) ?? docIds.clauseId;
      const rateDriveId = docIds.rateId;
      const specDriveId = docIds.specId;

      if (result.rows.length === 0) {
        // products 表沒有，但 policies 可能有已審核分析
        return NextResponse.json({ product: null, analysis, pdfDriveId, rateDriveId, specDriveId });
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
        pdfDriveId,
        rateDriveId,
        specDriveId,
      });
    }

    // Default: search drive_registry.json in-memory
    const company = searchParams.get("company") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const category = searchParams.get("category") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "1";

    // 商品查詢只露出「已審核歸檔」的商品（未審核的無意義，不顯示）
    await ensureInit();
    const archived = await db.execute({
      sql: "SELECT plan_code, analysis_json FROM policies WHERE status = 'archived' ORDER BY archived_at DESC",
      args: [],
    });
    const archivedSet = new Set<string>();
    const typeMap = new Map<string, string[]>();   // plan_code → 險種（取最新一筆）
    for (const r of archived.rows) {
      const pc = r.plan_code as string;
      archivedSet.add(pc);
      if (!typeMap.has(pc) && r.analysis_json) {
        try {
          const a = JSON.parse(r.analysis_json as string) as { insuranceType?: string[] | string };
          const t = Array.isArray(a.insuranceType) ? a.insuranceType : a.insuranceType ? [a.insuranceType] : [];
          if (t.length) typeMap.set(pc, t);
        } catch { /* ignore bad json */ }
      }
    }

    // 先以 archivedSet 篩，再套關鍵字/公司/類別；planCodes 在 limit 之前套用，
    // 避免歸檔商品落在 registry 500 筆上限之外而被切掉
    const products = searchDriveProducts({ company, keyword, category, activeOnly, planCodes: archivedSet });
    const annotated = products.map(p => ({ ...p, analyzed: true, insuranceType: typeMap.get(p.plan_code) ?? [] }));

    return NextResponse.json({ products: annotated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
