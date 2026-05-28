import db, { ensureInit } from "./db";
import type { ProductRow, AnalysisRow } from "./db";
import fs from "fs";

// ── Company ─────────────────────────────────────────────────────────

async function upsertCompany(name: string): Promise<number> {
  const existing = await db.execute({ sql: "SELECT id FROM companies WHERE name = ?", args: [name] });
  if (existing.rows[0]) return Number(existing.rows[0]["id"]);
  const result = await db.execute({ sql: "INSERT INTO companies (name) VALUES (?)", args: [name] });
  return Number(result.lastInsertRowid);
}

// ── Product lookup ───────────────────────────────────────────────────

export interface LookupKey {
  company: string;
  planCode: string;
  planType?: string;
  year?: string;
  version?: string;
}

export async function findProduct(key: LookupKey): Promise<ProductRow | undefined> {
  await ensureInit();
  const companyResult = await db.execute({
    sql: "SELECT id FROM companies WHERE name = ?",
    args: [key.company],
  });
  if (!companyResult.rows[0]) return undefined;
  const companyId = Number(companyResult.rows[0]["id"]);

  const result = await db.execute({
    sql: `SELECT * FROM products
          WHERE company_id = ?
            AND plan_code = ?
            AND (plan_type = ? OR (plan_type IS NULL AND ? IS NULL))
            AND (year = ? OR (year IS NULL AND ? IS NULL))
            AND (version = ? OR (version IS NULL AND ? IS NULL))
          ORDER BY verified DESC, updated_at DESC
          LIMIT 1`,
    args: [
      companyId,
      key.planCode,
      key.planType ?? null, key.planType ?? null,
      key.year ?? null, key.year ?? null,
      key.version ?? null, key.version ?? null,
    ],
  });
  return result.rows[0] ? (result.rows[0] as unknown as ProductRow) : undefined;
}

// ── Apply corrections to a coverage template ────────────────────────

export async function applyCorrections(productId: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await db.execute({
    sql: "SELECT field_path, new_value FROM corrections WHERE product_id = ? ORDER BY created_at ASC",
    args: [productId],
  });

  const corrections = result.rows as unknown as { field_path: string; new_value: string }[];
  const output = JSON.parse(JSON.stringify(data));
  for (const c of corrections) {
    setNestedValue(output, c.field_path, c.new_value);
  }
  return output;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string) {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

// ── Store new product + analysis ─────────────────────────────────────

export interface StoreParams {
  company: string;
  productName: string;
  planCode: string;
  planType?: string;
  year?: string;
  version?: string;
  category?: string;
  coverageTemplate: Record<string, unknown>;
  filePath?: string;
  insuredAmount: string;
  analysisJson: Record<string, unknown>;
}

export async function storeAnalysis(params: StoreParams): Promise<{ productId: number; analysisId: number }> {
  await ensureInit();
  const companyId = await upsertCompany(params.company);

  const existing = await findProduct({
    company: params.company,
    planCode: params.planCode,
    planType: params.planType,
    year: params.year,
    version: params.version,
  });

  let productId: number;
  if (existing) {
    await db.execute({
      sql: `UPDATE products SET
              product_name = ?, category = ?, coverage_template = ?,
              file_path = COALESCE(?, file_path), updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        params.productName,
        params.category ?? null,
        JSON.stringify(params.coverageTemplate),
        params.filePath ?? null,
        existing.id,
      ],
    });
    productId = existing.id;
  } else {
    const result = await db.execute({
      sql: `INSERT INTO products
              (company_id, product_name, plan_code, plan_type, year, version, category, coverage_template, file_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        companyId,
        params.productName,
        params.planCode,
        params.planType ?? null,
        params.year ?? null,
        params.version ?? null,
        params.category ?? null,
        JSON.stringify(params.coverageTemplate),
        params.filePath ?? null,
      ],
    });
    productId = Number(result.lastInsertRowid);
  }

  const analysisResult = await db.execute({
    sql: `INSERT INTO analyses (product_id, insured_amount, analysis_json, file_path)
          VALUES (?, ?, ?, ?)`,
    args: [
      productId,
      params.insuredAmount,
      JSON.stringify(params.analysisJson),
      params.filePath ?? null,
    ],
  });

  return { productId, analysisId: Number(analysisResult.lastInsertRowid) };
}

// ── Save correction ──────────────────────────────────────────────────

export async function saveCorrection(params: {
  productId: number;
  fieldPath: string;
  oldValue?: string;
  newValue: string;
  note?: string;
}): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: `INSERT INTO corrections (product_id, field_path, old_value, new_value, note)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      params.productId,
      params.fieldPath,
      params.oldValue ?? null,
      params.newValue,
      params.note ?? null,
    ],
  });

  const productResult = await db.execute({
    sql: "SELECT coverage_template FROM products WHERE id = ?",
    args: [params.productId],
  });
  const product = productResult.rows[0] as unknown as { coverage_template: string };
  const updated = await applyCorrections(params.productId, JSON.parse(product.coverage_template));
  await db.execute({
    sql: "UPDATE products SET coverage_template = ?, updated_at = datetime('now'), verified = 1 WHERE id = ?",
    args: [JSON.stringify(updated), params.productId],
  });
}

// ── Product search ────────────────────────────────────────────────────

export interface ProductSearchResult extends ProductRow {
  company: string;
  latest_analysis?: string;
}

export async function searchProducts(params: {
  company?: string;
  keyword?: string;
  category?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<ProductSearchResult[]> {
  await ensureInit();
  const { company, keyword, category, activeOnly, limit = 500 } = params;

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (company) {
    conditions.push("c.name = ?");
    args.push(company);
  }
  if (keyword) {
    conditions.push("(p.product_name LIKE ? OR p.plan_code LIKE ?)");
    args.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    conditions.push("p.category = ?");
    args.push(category);
  }
  if (activeOnly) {
    conditions.push(
      `(p.coverage_template NOT LIKE '%"_source":"tii_catalog"%' OR p.coverage_template LIKE '%"_active":true%')`
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute({
    sql: `SELECT p.*, c.name AS company,
            (SELECT a.analysis_json FROM analyses a WHERE a.product_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS latest_analysis
          FROM products p
          JOIN companies c ON p.company_id = c.id
          ${where}
          ORDER BY c.name ASC, p.product_name ASC, p.year DESC
          LIMIT ?`,
    args: [...args, limit],
  });
  return result.rows as unknown as ProductSearchResult[];
}

export async function getCompanies(): Promise<string[]> {
  await ensureInit();
  const result = await db.execute({ sql: "SELECT name FROM companies ORDER BY name ASC", args: [] });
  return result.rows.map(r => r["name"] as string);
}

export async function getCategories(): Promise<string[]> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category ASC",
    args: [],
  });
  return result.rows.map(r => r["category"] as string);
}

// ── Recent analyses (for history UI) ─────────────────────────────────

export async function recentAnalyses(limit = 20): Promise<(AnalysisRow & { company: string; product_name: string; plan_code: string })[]> {
  await ensureInit();
  const result = await db.execute({
    sql: `SELECT a.*, c.name AS company, p.product_name, p.plan_code
          FROM analyses a
          JOIN products p ON a.product_id = p.id
          JOIN companies c ON p.company_id = c.id
          ORDER BY a.created_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows as unknown as (AnalysisRow & { company: string; product_name: string; plan_code: string })[];
}

// ── Catalog seed from TII JSON ────────────────────────────────────────

export interface CatalogEntry {
  company: string;
  productName: string;
  planCode: string;
  category: string;
  year: string;
  saleDate: string;
  stopDate: string;
  active: boolean;
}

export async function seedFromCatalog(catalogPath: string): Promise<{ inserted: number; skipped: number }> {
  await ensureInit();
  const raw = fs.readFileSync(catalogPath, "utf8");
  const entries: CatalogEntry[] = JSON.parse(raw);

  let inserted = 0;
  let skipped = 0;

  // Upsert all unique companies first
  const companies = [...new Set(entries.map(e => e.company))];
  const companyIds: Record<string, number> = {};
  for (const name of companies) {
    companyIds[name] = await upsertCompany(name);
  }

  // Batch insert products in chunks of 100
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    for (const e of chunk) {
      const template = JSON.stringify({
        _source: "tii_catalog",
        _saleDate: e.saleDate,
        _stopDate: e.stopDate,
        _active: e.active,
      });
      try {
        const res = await db.execute({
          sql: `INSERT OR IGNORE INTO products
                  (company_id, product_name, plan_code, category, year, coverage_template)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            companyIds[e.company],
            e.productName,
            e.planCode,
            e.category || null,
            e.year || null,
            template,
          ],
        });
        if (Number(res.rowsAffected) > 0) inserted++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
  }

  return { inserted, skipped };
}
