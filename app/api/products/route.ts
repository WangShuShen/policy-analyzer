import { NextRequest, NextResponse } from "next/server";
import { searchProducts, getCompanies, getCategories } from "@/lib/policyCache";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    if (action === "meta") {
      const [companies, categories] = await Promise.all([getCompanies(), getCategories()]);
      return NextResponse.json({ companies, categories });
    }

    const company = searchParams.get("company") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const category = searchParams.get("category") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "1";

    const products = await searchProducts({ company, keyword, category, activeOnly });
    return NextResponse.json({ products });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
