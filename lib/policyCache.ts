import db, { nowText, descNullsLast } from "./db";
import type { ProductRow, AnalysisRow } from "./db";
import { companies, products, analyses, corrections } from "./schema";
import { and, asc, desc, eq, ilike, isNotNull, isNull, notLike, like, or, sql, type SQL } from "drizzle-orm";
import fs from "fs";

/** 可為 NULL 的欄位比對：值為空時比 IS NULL（SQL 的 = NULL 永遠不成立） */
const eqOrNull = (col: Parameters<typeof eq>[0], v: string | undefined) =>
  v == null ? isNull(col) : eq(col, v);

// ── Company ─────────────────────────────────────────────────────────

async function upsertCompany(name: string): Promise<number> {
  const existing = await db.select({ id: companies.id }).from(companies).where(eq(companies.name, name)).limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db.insert(companies).values({ name })
    .onConflictDoUpdate({ target: companies.name, set: { name } })   // 併發時另一個請求剛建好也拿得到 id
    .returning({ id: companies.id });
  return row.id;
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
  const company = await db.select({ id: companies.id }).from(companies).where(eq(companies.name, key.company)).limit(1);
  if (!company[0]) return undefined;

  const rows = await db.select().from(products)
    .where(and(
      eq(products.company_id, company[0].id),
      eq(products.plan_code, key.planCode),
      eqOrNull(products.plan_type, key.planType),
      eqOrNull(products.year, key.year),
      eqOrNull(products.version, key.version),
    ))
    .orderBy(desc(products.verified), desc(products.updated_at))
    .limit(1);
  return rows[0];
}

// ── Apply corrections to a coverage template ────────────────────────

export async function applyCorrections(productId: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rows = await db.select({ field_path: corrections.field_path, new_value: corrections.new_value })
    .from(corrections).where(eq(corrections.product_id, productId)).orderBy(asc(corrections.created_at), asc(corrections.id));

  const output = JSON.parse(JSON.stringify(data));
  for (const c of rows) {
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
  /** 發起這次分析的使用者（顧問為 advisors.id、客戶為 users.id）。 */
  userId?: string;
}

export async function storeAnalysis(params: StoreParams): Promise<{ productId: number; analysisId: number }> {
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
    await db.update(products).set({
      product_name: params.productName,
      category: params.category ?? null,
      coverage_template: JSON.stringify(params.coverageTemplate),
      file_path: sql`COALESCE(${params.filePath ?? null}, ${products.file_path})`,
      updated_at: nowText,
    }).where(eq(products.id, existing.id));
    productId = existing.id;
  } else {
    const [row] = await db.insert(products).values({
      company_id: companyId,
      product_name: params.productName,
      plan_code: params.planCode,
      plan_type: params.planType ?? null,
      year: params.year ?? null,
      version: params.version ?? null,
      category: params.category ?? null,
      coverage_template: JSON.stringify(params.coverageTemplate),
      file_path: params.filePath ?? null,
    }).returning({ id: products.id });
    productId = row.id;
  }

  const [analysis] = await db.insert(analyses).values({
    product_id: productId,
    insured_amount: params.insuredAmount,
    analysis_json: JSON.stringify(params.analysisJson),
    file_path: params.filePath ?? null,
    user_id: params.userId ?? null,
  }).returning({ id: analyses.id });

  return { productId, analysisId: analysis.id };
}

// ── Save correction ──────────────────────────────────────────────────

export async function saveCorrection(params: {
  productId: number;
  fieldPath: string;
  oldValue?: string;
  newValue: string;
  note?: string;
}): Promise<void> {
  await db.insert(corrections).values({
    product_id: params.productId,
    field_path: params.fieldPath,
    old_value: params.oldValue ?? null,
    new_value: params.newValue,
    note: params.note ?? null,
  });

  const [product] = await db.select({ coverage_template: products.coverage_template })
    .from(products).where(eq(products.id, params.productId)).limit(1);
  const updated = await applyCorrections(params.productId, JSON.parse(product.coverage_template));
  await db.update(products)
    .set({ coverage_template: JSON.stringify(updated), updated_at: nowText, verified: 1 })
    .where(eq(products.id, params.productId));
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
  const { company, keyword, category, activeOnly, limit = 500 } = params;

  const conds: SQL[] = [];
  if (company) conds.push(eq(companies.name, company));
  // SQLite 的 LIKE 不分大小寫，Postgres 要用 ILIKE 才維持原本行為（例如 plan_code 英文字母）
  if (keyword) conds.push(or(ilike(products.product_name, `%${keyword}%`), ilike(products.plan_code, `%${keyword}%`))!);
  if (category) conds.push(eq(products.category, category));
  if (activeOnly) {
    conds.push(or(
      notLike(products.coverage_template, '%"_source":"tii_catalog"%'),
      like(products.coverage_template, '%"_active":true%'),
    )!);
  }

  const latest = sql<string | null>`(SELECT a.analysis_json FROM analyses a WHERE a.product_id = ${products.id} ORDER BY a.created_at DESC LIMIT 1)`;
  const rows = await db.select({ product: products, company: companies.name, latest_analysis: latest })
    .from(products)
    .innerJoin(companies, eq(products.company_id, companies.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(companies.name), asc(products.product_name), descNullsLast(products.year))
    .limit(limit);
  return rows.map(r => ({ ...r.product, company: r.company, latest_analysis: r.latest_analysis ?? undefined }));
}

export async function getCompanies(): Promise<string[]> {
  const rows = await db.select({ name: companies.name }).from(companies).orderBy(asc(companies.name));
  return rows.map(r => r.name);
}

export async function getCategories(): Promise<string[]> {
  const rows = await db.selectDistinct({ category: products.category }).from(products)
    .where(isNotNull(products.category)).orderBy(asc(products.category));
  return rows.map(r => r.category as string);
}

// ── Recent analyses (for history UI) ─────────────────────────────────

export async function recentAnalyses(limit = 20): Promise<(AnalysisRow & { company: string; product_name: string; plan_code: string })[]> {
  const rows = await db.select({ a: analyses, company: companies.name, product_name: products.product_name, plan_code: products.plan_code })
    .from(analyses)
    .innerJoin(products, eq(analyses.product_id, products.id))
    .innerJoin(companies, eq(products.company_id, companies.id))
    .orderBy(desc(analyses.created_at))
    .limit(limit);
  return rows.map(r => ({ ...r.a, company: r.company, product_name: r.product_name, plan_code: r.plan_code }));
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
        const res = await db.insert(products).values({
          company_id: companyIds[e.company],
          product_name: e.productName,
          plan_code: e.planCode,
          category: e.category || null,
          year: e.year || null,
          coverage_template: template,
        }).onConflictDoNothing().returning({ id: products.id });
        if (res.length > 0) inserted++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
  }

  return { inserted, skipped };
}
