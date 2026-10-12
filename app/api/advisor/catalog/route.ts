import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth";
import { searchCatalog, catalogCounts } from "@/lib/catalog/search";

// GET /api/advisor/catalog?q=&tab=mine|other → 商品查詢（只列名稱、版次、險種、是否現售；明細在商品頁）
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const sp = req.nextUrl.searchParams;
  const tab = sp.get("tab") === "mine" ? "mine" : "other";
  return NextResponse.json({ ...searchCatalog(sp.get("q") ?? "", tab), counts: catalogCounts() });
}
