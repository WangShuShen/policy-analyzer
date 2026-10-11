import { NextRequest, NextResponse } from "next/server";
import db, { descNullsLast, type PolicyRow } from "@/lib/db";
import { policies, policyAssignments } from "@/lib/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { verifyJWT } from "@/lib/jwt";
import { requireAdvisor } from "@/lib/auth";
import { getDocIds } from "@/lib/driveIndex";
import { getDriveProduct } from "@/lib/driveRegistry";

function toProduct(p: PolicyRow, assignmentStatus?: string) {
  const docs = getDocIds(p.plan_code);
  const reg = getDriveProduct(p.plan_code);
  // 險種來自審核分析 analysis_json.insuranceType（人工審過最準）
  let insuranceType: string[] = [];
  let displayCode: string | null = null;
  if (p.analysis_json) {
    try {
      const a = JSON.parse(p.analysis_json) as { insuranceType?: string[] | string; displayCode?: string };
      insuranceType = Array.isArray(a.insuranceType) ? a.insuranceType : a.insuranceType ? [a.insuranceType] : [];
      displayCode = a.displayCode ?? null;
    } catch { /* ignore */ }
  }
  return {
    id: p.uuid,
    planCode: p.plan_code,
    displayCode,
    company: p.company ?? reg?.company ?? "",
    product_name: p.product_name ?? reg?.product_name ?? "",
    sheetUrl: "", // Google Sheet 已退場，保留欄位相容前端
    pdfDriveId: p.pdf_drive_id ?? docs.clauseId ?? "",
    rateDriveId: docs.rateId,
    specDriveId: docs.specId,
    filename: p.filename ?? "",
    uploadedAt: p.uploaded_at ?? "",
    category: p.category ?? reg?.category ?? null,
    insuranceType,
    // 商品脈絡（同商品頁/查詢）
    planType: reg?.plan_type ?? null,
    saleDate: reg?.sale_date ?? null,
    stopDate: reg?.stop_date ?? null,
    productStatus: reg?.status ?? null,
    currency: reg?.currency ?? null,
    ...(assignmentStatus ? { assignmentStatus } : {}),
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisor(req);
  if (guard instanceof NextResponse) return guard;
  try {
    // Single item lookup
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const [row] = await db.select().from(policies).where(eq(policies.uuid, id)).limit(1);
      if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(toProduct(row));
    }

    // Identify caller
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;

    // 只有「未登入(dev)」或「管理者明確要求 ?all=1」才看全部待審
    const wantAll = req.nextUrl.searchParams.get("all") === "1";
    if (!payload || (wantAll && payload.isAdmin)) {
      const rows = await db.select().from(policies).where(eq(policies.status, "uploaded"))
        .orderBy(descNullsLast(policies.uploaded_at), desc(policies.created_at), asc(policies.uuid));
      const products = rows.map(row => toProduct(row));
      return NextResponse.json({ products, count: products.length, scope: "all" });
    }

    // 一般（含管理者）：只顯示「指派給我、且尚待審核」的保單
    // 一張保單可能有多天的指派紀錄，這裡以保單為單位去重（否則清單會出現大量重複列）。
    // assignment_status 取 MAX()：字典序 'completed' < 'pending'，故只要還有一筆未完成就顯示 pending。
    const maxStatus = sql<string>`max(${policyAssignments.status})`;
    const assigned = await db.select({ p: policies, assignment_status: maxStatus })
      .from(policyAssignments)
      .innerJoin(policies, eq(policies.uuid, policyAssignments.policy_uuid))
      .where(and(eq(policyAssignments.advisor_id, payload.advisorId), eq(policies.status, "uploaded")))
      .groupBy(policies.uuid)   // 以主鍵分組，Postgres 允許選取 policies 的其他欄位
      // 同一天上傳的保單常有上百張並列，加上代號當次排序，清單每次載入順序才固定
      .orderBy(sql`${maxStatus} ASC`, descNullsLast(policies.uploaded_at), asc(policies.uuid));

    const products = assigned.map(row => toProduct(row.p, row.assignment_status));

    return NextResponse.json({ products, count: products.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
