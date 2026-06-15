import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./data/policies.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initPromise: Promise<void> | null = null;

export async function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = db.batch([
    `CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      product_name TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      plan_type TEXT,
      year TEXT,
      version TEXT,
      category TEXT,
      coverage_template TEXT NOT NULL,
      file_path TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      formula_json TEXT,
      formula_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, plan_code, plan_type, year, version)
    )`,
    `CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      insured_amount TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      field_path TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS advisors (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS policy_assignments (
      id TEXT PRIMARY KEY,
      policy_uuid TEXT NOT NULL,
      advisor_id TEXT NOT NULL REFERENCES advisors(id),
      assigned_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(policy_uuid, assigned_date)
    )`,
    // 審核流程的唯一真實來源（取代本機 uuid_registry.json + analyzed/*.json）
    `CREATE TABLE IF NOT EXISTS policies (
      uuid TEXT PRIMARY KEY,
      plan_code TEXT NOT NULL,
      company TEXT,
      product_name TEXT,
      pdf_drive_id TEXT,
      rate_drive_id TEXT,
      filename TEXT,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'uploaded',
      analysis_json TEXT,
      uploaded_at TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ], "write").then(() => undefined);
  return initPromise;
}

export async function getAdvisorByEmail(email: string): Promise<AdvisorRow | null> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT * FROM advisors WHERE email = ? AND is_active = 1",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    is_admin: r.is_admin as number,
    is_active: r.is_active as number,
    created_at: r.created_at as string,
  };
}

export async function listAdvisors(): Promise<AdvisorRow[]> {
  await ensureInit();
  const result = await db.execute("SELECT * FROM advisors ORDER BY created_at DESC");
  return result.rows.map(r => ({
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    is_admin: r.is_admin as number,
    is_active: r.is_active as number,
    created_at: r.created_at as string,
  }));
}

export default db;

// ── Types ──────────────────────────────────────────────────────────

export interface FormulaItem {
  label: string;
  type: "fixed" | "multiplier" | "reimbursement" | "range" | "lump_sum";
  multiplier?: number;
  rate_type?: "multiplier" | "percentage";
  min_rate?: number;
  max_rate?: number;
  limit?: { days?: number; times?: number };
  note?: string;
  // 計劃別：各計劃對應的數值（由 type 決定如何使用：倍率→倍數、定額/一次性→金額）
  plan_values?: Record<string, number>;
}

export interface FormulaJson {
  base_unit: string;
  items: FormulaItem[];
  filled_by: string;
  filled_at: string;
  // 計劃清單（如 ["1","2","3","4","5"] 或 ["A","B","C"]）；空代表此商品無計劃別
  plans?: string[];
}

export interface ProductRow {
  id: number;
  company_id: number;
  product_name: string;
  plan_code: string;
  plan_type: string | null;
  year: string | null;
  version: string | null;
  category: string | null;
  coverage_template: string;
  file_path: string | null;
  verified: number;
  formula_json: string | null;
  formula_verified: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRow {
  id: number;
  product_id: number;
  insured_amount: string;
  analysis_json: string;
  file_path: string | null;
  created_at: string;
}

export interface CorrectionRow {
  id: number;
  product_id: number;
  field_path: string;
  old_value: string | null;
  new_value: string;
  note: string | null;
  created_at: string;
}

export interface AdvisorRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  is_active: number;
  created_at: string;
}

export interface PolicyRow {
  uuid: string;
  plan_code: string;
  company: string | null;
  product_name: string | null;
  pdf_drive_id: string | null;
  rate_drive_id: string | null;
  filename: string | null;
  category: string | null;
  status: string; // uploaded | archived | failed
  analysis_json: string | null;
  uploaded_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
