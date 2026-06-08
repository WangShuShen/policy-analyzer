import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_DIR = process.env.DB_DIR ?? "";

export async function GET(req: NextRequest) {
  try {
    const registryPath = path.join(DB_DIR, "uuid_registry.json");
    if (!fs.existsSync(registryPath)) {
      return NextResponse.json({ products: [], count: 0 });
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Record<string, Record<string, string>>;

    // Single item lookup
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const v = registry[id];
      if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({
        id,
        planCode: v.planCode ?? id,
        company: v.company ?? "",
        product_name: v.productName ?? "",
        sheetUrl: v.sheetUrl ?? "",
        pdfDriveId: v.pdfDriveId ?? "",
        filename: v.filename ?? "",
        uploadedAt: v.uploadedAt ?? "",
        category: null,
      });
    }

    const products = Object.entries(registry)
      .filter(([, v]) => v.status === "uploaded")
      .map(([uuid, v]) => ({
        id: uuid,
        planCode: v.planCode ?? uuid,
        company: v.company ?? "",
        product_name: v.productName ?? "",
        sheetUrl: v.sheetUrl ?? "",
        pdfDriveId: v.pdfDriveId ?? "",
        filename: v.filename ?? "",
        uploadedAt: v.uploadedAt ?? "",
        category: null as string | null,
      }));

    return NextResponse.json({ products, count: products.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
