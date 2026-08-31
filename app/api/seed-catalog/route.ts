import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { seedFromCatalog } from "@/lib/policyCache";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const catalogPath = path.join(process.cwd(), "data", "tii_sanshang_products.json");
    const result = await seedFromCatalog(catalogPath);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
