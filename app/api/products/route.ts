import { NextRequest, NextResponse } from "next/server";
import { searchDriveProducts, getDriveCompanies, getDriveCategories } from "@/lib/driveRegistry";
import { getDocIds } from "@/lib/driveIndex";
import db, { descNullsLast } from "@/lib/db";
import { companies, products as productsTable, policies } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireIdentity } from "@/lib/auth";
import { consume } from "@/lib/entitlements";

export async function GET(req: NextRequest) {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;
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
    // 這是「商品查詢」的計次點；瀏覽清單與篩選不扣額度。
    const planCode = searchParams.get("planCode");
    if (planCode) {
      const quota = await consume(auth, "product.detail");
      if (!quota.ok) return quota.response;
      const result = await db.select({
          id: productsTable.id, product_name: productsTable.product_name, plan_code: productsTable.plan_code,
          category: productsTable.category, company: companies.name,
        })
        .from(productsTable).innerJoin(companies, eq(companies.id, productsTable.company_id))
        .where(eq(productsTable.plan_code, planCode))
        .orderBy(desc(productsTable.verified), desc(productsTable.updated_at))
        .limit(1);
      // 已審核分析內容（給付明細／限制／注意事項）+ Drive PDF 來源
      const pol = await db.select({ analysis_json: policies.analysis_json, status: policies.status, pdf_drive_id: policies.pdf_drive_id })
        .from(policies)
        .where(and(eq(policies.plan_code, planCode), eq(policies.status, "archived")))
        .orderBy(descNullsLast(policies.archived_at))
        .limit(1);
      const analysis = pol[0]?.analysis_json ? JSON.parse(pol[0].analysis_json) : null;
      // 三種文件 Drive ID：條款優先用 policies.pdf_drive_id，否則退回索引 clauseId
      const docIds = getDocIds(planCode);
      const pdfDriveId = pol[0]?.pdf_drive_id ?? docIds.clauseId;
      const rateDriveId = docIds.rateId;
      const specDriveId = docIds.specId;

      if (result.length === 0) {
        // products 表沒有，但 policies 可能有已審核分析
        return NextResponse.json({ product: null, analysis, pdfDriveId, rateDriveId, specDriveId });
      }
      const r = result[0];
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
    const archived = await db.select({ plan_code: policies.plan_code, analysis_json: policies.analysis_json })
      .from(policies).where(eq(policies.status, "archived")).orderBy(descNullsLast(policies.archived_at));
    const archivedSet = new Set<string>();
    const typeMap = new Map<string, string[]>();   // plan_code → 險種（取最新一筆）
    const codeMap = new Map<string, string>();     // plan_code → 商品代號（顧問填的 displayCode）
    for (const r of archived) {
      const pc = r.plan_code;
      archivedSet.add(pc);
      if (!typeMap.has(pc) && r.analysis_json) {
        try {
          const a = JSON.parse(r.analysis_json) as { insuranceType?: string[] | string; displayCode?: string };
          const t = Array.isArray(a.insuranceType) ? a.insuranceType : a.insuranceType ? [a.insuranceType] : [];
          if (t.length) typeMap.set(pc, t);
          if (a.displayCode) codeMap.set(pc, a.displayCode);
        } catch { /* ignore bad json */ }
      }
    }

    // 先以 archivedSet 篩，再套關鍵字/公司/類別；planCodes 在 limit 之前套用，
    // 避免歸檔商品落在 registry 500 筆上限之外而被切掉
    const products = searchDriveProducts({ company, keyword, category, activeOnly, planCodes: archivedSet });
    const annotated = products.map(p => ({
      ...p, analyzed: true,
      insuranceType: typeMap.get(p.plan_code) ?? [],
      displayCode: codeMap.get(p.plan_code) ?? null,
    }));

    return NextResponse.json({ products: annotated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
