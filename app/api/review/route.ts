import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, type PolicyRow } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

function toProduct(p: PolicyRow, assignmentStatus?: string) {
  return {
    id: p.uuid,
    planCode: p.plan_code,
    company: p.company ?? "",
    product_name: p.product_name ?? "",
    sheetUrl: "", // Google Sheet 已退場，保留欄位相容前端
    pdfDriveId: p.pdf_drive_id ?? "",
    filename: p.filename ?? "",
    uploadedAt: p.uploaded_at ?? "",
    category: p.category,
    ...(assignmentStatus ? { assignmentStatus } : {}),
  };
}

export async function GET(req: NextRequest) {
  try {
    await ensureInit();

    // Single item lookup
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const r = await db.execute({ sql: "SELECT * FROM policies WHERE uuid = ?", args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(toProduct(r.rows[0] as unknown as PolicyRow));
    }

    // Identify caller
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;

    // 只有「未登入(dev)」或「管理者明確要求 ?all=1」才看全部待審
    const wantAll = req.nextUrl.searchParams.get("all") === "1";
    if (!payload || (wantAll && payload.isAdmin)) {
      const r = await db.execute({
        sql: "SELECT * FROM policies WHERE status = 'uploaded' ORDER BY uploaded_at DESC, created_at DESC",
        args: [],
      });
      const products = r.rows.map(row => toProduct(row as unknown as PolicyRow));
      return NextResponse.json({ products, count: products.length, scope: "all" });
    }

    // 一般（含管理者）：只顯示「指派給我、且尚待審核」的保單
    const assigned = await db.execute({
      sql: `SELECT p.*, a.status AS assignment_status
            FROM policy_assignments a
            JOIN policies p ON p.uuid = a.policy_uuid
            WHERE a.advisor_id = ? AND p.status = 'uploaded'
            ORDER BY a.status ASC, p.uploaded_at DESC`,
      args: [payload.advisorId],
    });

    const products = assigned.rows.map(row =>
      toProduct(row as unknown as PolicyRow, row.assignment_status as string)
    );

    return NextResponse.json({ products, count: products.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
