// node scripts/ingest-pending.mjs
// 從 drive_index.json + drive_registry.json 把「有條款 PDF、尚未分析」的商品
// 灌進 policies 表，status='pending_analysis'，pdf_drive_id = 條款 fileId。
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^(\w+)="?([^"]*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${join(ROOT, "data/policies.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const DB_DIR = process.env.DB_DIR || join(ROOT, "..", "100_Todo/projects");
const index = JSON.parse(readFileSync(join(DB_DIR, "drive_index.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(DB_DIR, "drive_registry.json"), "utf8"));

// planCode -> registry entry
const regByPlan = {};
for (const v of Object.values(registry)) if (v.planCode) regByPlan[v.planCode] = v;

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS policies (
    uuid TEXT PRIMARY KEY, plan_code TEXT NOT NULL, company TEXT, product_name TEXT,
    pdf_drive_id TEXT, filename TEXT, category TEXT, status TEXT NOT NULL DEFAULT 'uploaded',
    analysis_json TEXT, uploaded_at TEXT, archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const LIMIT = Number(process.argv[2]) || 0; // 0 = 全部
let ingested = 0, skipped = 0, count = 0;

for (const [plan, info] of Object.entries(index)) {
  if (!info.clauseId) { skipped++; continue; }
  if (LIMIT && count >= LIMIT) break;

  // 已存在且已分析（uploaded/archived）→ 不覆蓋
  const exist = await db.execute({ sql: "SELECT status FROM policies WHERE uuid = ?", args: [plan] });
  if (exist.rows[0] && ["uploaded", "archived"].includes(exist.rows[0].status)) { skipped++; continue; }

  const reg = regByPlan[plan] ?? {};
  await db.execute({
    sql: `INSERT INTO policies (uuid, plan_code, company, product_name, pdf_drive_id, rate_drive_id, category, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_analysis', datetime('now'))
          ON CONFLICT(uuid) DO UPDATE SET
            pdf_drive_id=excluded.pdf_drive_id, rate_drive_id=excluded.rate_drive_id, company=excluded.company,
            product_name=excluded.product_name, category=excluded.category,
            status='pending_analysis', updated_at=datetime('now')`,
    args: [plan, plan, reg.company ?? null, reg.productName ?? info.productFolder ?? null,
           info.clauseId, info.rateId ?? null, reg.productType ?? null],
  });
  ingested++; count++;
}

const c = await db.execute("SELECT status, COUNT(*) n FROM policies GROUP BY status ORDER BY status");
console.log(`Ingest 完成：新增/更新 ${ingested} 筆 pending_analysis，略過 ${skipped} 筆`);
console.log("policies 各狀態：");
for (const r of c.rows) console.log(`  ${r.status}: ${r.n}`);
process.exit(0);
