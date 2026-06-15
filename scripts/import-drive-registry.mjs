// node scripts/import-drive-registry.mjs
// 把 drive_registry.json 的 3,705 筆南山商品匯入 Turso
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// 讀本地 .env 取得 Turso 憑證
function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^(\w+)="?([^"]*)"?$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  } catch {}
}
loadEnv();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${join(ROOT, "data/policies.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 確保 schema 存在（含 formula_json）
await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    product_name TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    plan_type TEXT,
    year TEXT,
    version TEXT,
    category TEXT,
    coverage_template TEXT,
    formula_json TEXT,
    formula_verified INTEGER NOT NULL DEFAULT 0,
    file_path TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(company_id, plan_code, plan_type, year, version)
  );
`);

// 嘗試加欄位（已存在時忽略錯誤）
for (const col of [
  "ALTER TABLE products ADD COLUMN formula_json TEXT",
  "ALTER TABLE products ADD COLUMN formula_verified INTEGER NOT NULL DEFAULT 0",
]) {
  try { await db.execute(col); } catch {}
}

const srcPath = join(ROOT, "..", "100_Todo/projects/drive_registry.json");
const registry = JSON.parse(readFileSync(srcPath, "utf8"));
const entries = Object.values(registry);
console.log(`drive_registry: ${entries.length} 筆`);

// 彙整所有公司
const companyNames = [...new Set(entries.map(e => e.company).filter(Boolean))];
const companyIds = {};
for (const name of companyNames) {
  const { rows } = await db.execute({ sql: "SELECT id FROM companies WHERE name=?", args: [name] });
  if (rows[0]) {
    companyIds[name] = Number(rows[0].id);
  } else {
    const r = await db.execute({ sql: "INSERT INTO companies (name) VALUES (?)", args: [name] });
    companyIds[name] = Number(r.lastInsertRowid);
  }
}
console.log(`公司數: ${companyNames.length}`);

let inserted = 0, skipped = 0, errors = 0;
const CHUNK = 50;

for (let i = 0; i < entries.length; i += CHUNK) {
  const chunk = entries.slice(i, i + CHUNK);
  for (const e of chunk) {
    if (!e.planCode || !e.company) { skipped++; continue; }
    const companyId = companyIds[e.company];
    if (!companyId) { skipped++; continue; }

    const template = JSON.stringify({
      _source: "drive_registry",
      _status: e.status ?? "",
      _saleDate: e.saleDate ?? "",
      _stopDate: e.stopDate ?? "",
      _active: e.status !== "停售",
      _contractType: e.contractType ?? "",
      _currency: e.currency ?? "",
      _versionFolder: e.versionFolder ?? "",
      _docTypes: e.docTypes ?? [],
    });

    try {
      const res = await db.execute({
        sql: `INSERT OR IGNORE INTO products
                (company_id, product_name, plan_code, category, coverage_template)
              VALUES (?, ?, ?, ?, ?)`,
        args: [companyId, e.productName, e.planCode, e.productType ?? null, template],
      });
      if (Number(res.rowsAffected) > 0) inserted++;
      else skipped++;
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`  ERR ${e.planCode}: ${err.message}`);
    }
  }
  if ((i / CHUNK) % 10 === 0) process.stdout.write(`  ${i + chunk.length}/${entries.length}...\r`);
}

console.log(`\n完成！插入 ${inserted} 筆，跳過 ${skipped} 筆，錯誤 ${errors} 筆`);
process.exit(0);
