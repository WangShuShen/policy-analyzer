import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { seedFromCatalog } from "@/lib/policyCache";

export async function POST(_req: NextRequest) {
  try {
    const catalogPath = path.join(process.cwd(), "data", "tii_sanshang_products.json");
    const result = await seedFromCatalog(catalogPath);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
