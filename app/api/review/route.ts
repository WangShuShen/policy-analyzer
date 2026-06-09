import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import db, { ensureInit } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

const DB_DIR = process.env.DB_DIR ?? "";

function toProduct(uuid: string, v: Record<string, string>) {
  return {
    id: uuid,
    planCode: v.planCode ?? uuid,
    company: v.company ?? "",
    product_name: v.productName ?? "",
    sheetUrl: v.sheetUrl ?? "",
    pdfDriveId: v.pdfDriveId ?? "",
    filename: v.filename ?? "",
    uploadedAt: v.uploadedAt ?? "",
    category: null as string | null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const registryPath = path.join(DB_DIR, "uuid_registry.json");
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json({ products: [], count: 0 });
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Record<string, Record<string, string>>;

    // Single item lookup (unchanged)
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const v = registry[id];
      if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(toProduct(id, v));
    }

    // Identify caller
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;

    await ensureInit();

    // Admin: show all uploaded policies
    if (!payload || payload.isAdmin) {
      const products = Object.entries(registry)
        .filter(([, v]) => v.status === "uploaded")
        .map(([uuid, v]) => toProduct(uuid, v));
      return NextResponse.json({ products, count: products.length });
    }

    // Advisor: show only today's assigned policies that are still pending
    const today = new Date().toISOString().slice(0, 10);
    const assigned = await db.execute({
      sql: "SELECT policy_uuid, status FROM policy_assignments WHERE advisor_id = ? AND assigned_date = ?",
      args: [payload.advisorId, today],
    });

    const products = assigned.rows
      .map(row => {
        const uuid = row.policy_uuid as string;
        const v = registry[uuid];
        if (!v) return null;
        return {
          ...toProduct(uuid, v),
          assignmentStatus: row.status as string,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ products, count: products.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
