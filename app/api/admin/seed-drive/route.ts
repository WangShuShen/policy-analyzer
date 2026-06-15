import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";

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
  const { rows } = await db.execute({ sql: "SELECT id FROM companies WHERE name=?", args: [name] });
  if (rows[0]) return Number(rows[0].id);
  const r = await db.execute({ sql: "INSERT INTO companies (name) VALUES (?)", args: [name] });
  return Number(r.lastInsertRowid);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInit();

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
      const res = await db.execute({
        sql: `INSERT OR IGNORE INTO products (company_id, product_name, plan_code, category, coverage_template) VALUES (?, ?, ?, ?, ?)`,
        args: [companyCache[e.company], e.productName, e.planCode, e.productType ?? null, template],
      });
      if (Number(res.rowsAffected) > 0) inserted++;
      else skipped++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, inserted, skipped, total: entries.length });
}
