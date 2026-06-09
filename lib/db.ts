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
