// Run with: node scripts/seed-catalog.mjs
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${join(ROOT, "data", "policies.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function upsertCompany(name) {
  const existing = await db.execute({ sql: "SELECT id FROM companies WHERE name = ?", args: [name] });
  if (existing.rows[0]) return Number(existing.rows[0]["id"]);
  const result = await db.execute({ sql: "INSERT INTO companies (name) VALUES (?)", args: [name] });
  return Number(result.lastInsertRowid);
}

async function main() {
  // Ensure tables exist
  await db.batch([
    `CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id), product_name TEXT NOT NULL, plan_code TEXT NOT NULL, plan_type TEXT, year TEXT, version TEXT, category TEXT, coverage_template TEXT NOT NULL, file_path TEXT, verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(company_id, plan_code, plan_type, year, version))`,
    `CREATE TABLE IF NOT EXISTS analyses (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), insured_amount TEXT NOT NULL, analysis_json TEXT NOT NULL, file_path TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id), field_path TEXT NOT NULL, old_value TEXT, new_value TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ], "write");

  const catalogPath = join(ROOT, "data", "tii_sanshang_products.json");
  const entries = JSON.parse(readFileSync(catalogPath, "utf8"));

  console.log(`Importing ${entries.length} products from TII catalog...`);

  const companyId = await upsertCompany("三商美邦人壽");
  console.log(`Company ID: ${companyId}`);

  let inserted = 0, skipped = 0;
  const CHUNK = 50;

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
          sql: `INSERT OR IGNORE INTO products (company_id, product_name, plan_code, category, year, coverage_template) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [companyId, e.productName, e.planCode, e.category || null, e.year || null, template],
        });
        if (Number(res.rowsAffected) > 0) inserted++;
        else skipped++;
      } catch (err) {
        console.error(`Error inserting ${e.planCode}:`, err.message);
        skipped++;
      }
    }
    process.stdout.write(`\r${i + chunk.length}/${entries.length} processed...`);
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
