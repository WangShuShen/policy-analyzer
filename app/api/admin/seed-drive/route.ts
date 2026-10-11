import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { companies, products } from "@/lib/schema";
import { eq } from "drizzle-orm";

interface DriveEntry {
  company: string;
  productName: string;
  planCode: string;
  productType?: string;
  contractType?: string;
  currency?: string;
  status?: string;
  saleDate?: string;
  stopDate?: string;
  versionFolder?: string;
  docTypes?: string[];
}

async function upsertCompany(name: string): Promise<number> {
  const rows = await db.select({ id: companies.id }).from(companies).where(eq(companies.name, name)).limit(1);
  if (rows[0]) return rows[0].id;
  const [r] = await db.insert(companies).values({ name })
    .onConflictDoUpdate({ target: companies.name, set: { name } })
    .returning({ id: companies.id });
  return r.id;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-seed-secret");
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { entries: DriveEntry[] };
  const entries = body.entries ?? [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries required" }, { status: 400 });
  }

  const companyCache: Record<string, number> = {};
  let inserted = 0, skipped = 0;

  for (const e of entries) {
    if (!e.planCode || !e.company) { skipped++; continue; }
    if (!companyCache[e.company]) {
      companyCache[e.company] = await upsertCompany(e.company);
    }
    const template = JSON.stringify({
      _source: "drive_registry",
      _status: e.status ?? "",
      _active: e.status !== "停售",
      _saleDate: e.saleDate ?? "",
      _stopDate: e.stopDate ?? "",
      _contractType: e.contractType ?? "",
      _docTypes: e.docTypes ?? [],
    });
    try {
      const res = await db.insert(products).values({
        company_id: companyCache[e.company], product_name: e.productName, plan_code: e.planCode,
        category: e.productType ?? null, coverage_template: template,
      }).onConflictDoNothing().returning({ id: products.id });
      if (res.length > 0) inserted++;
      else skipped++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, inserted, skipped, total: entries.length });
}
