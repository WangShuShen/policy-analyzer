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
  ], "write").then(() => undefined);
  return initPromise;
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
