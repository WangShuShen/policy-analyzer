// node scripts/migrate-policies.mjs
// 把本機 uuid_registry.json + analyzed/*.json 遷移進 DB 的 policies 表。
// 預設寫本機 SQLite（file:./data/policies.db）；若 .env 有 Turso 憑證則寫 Turso。
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^(\w+)="?([^"]*?)"?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${join(ROOT, "data/policies.db")}`,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const DB_DIR = process.env.DB_DIR || join(ROOT, "..", "100_Todo/projects");

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS policies (
    uuid TEXT PRIMARY KEY,
    plan_code TEXT NOT NULL,
    company TEXT,
    product_name TEXT,
    pdf_drive_id TEXT,
    filename TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    analysis_json TEXT,
    uploaded_at TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const registryPath = join(DB_DIR, "uuid_registry.json");
if (!existsSync(registryPath)) {
  console.error(`找不到 ${registryPath}`);
  process.exit(1);
}
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

let migrated = 0, withAnalysis = 0, skipped = 0;
for (const [uuid, v] of Object.entries(registry)) {
  if (!v || !uuid) { skipped++; continue; }

  // analysis JSON（若有）
  let analysisJson = null;
  const analyzedPath = join(DB_DIR, "analyzed", `${uuid}.json`);
  if (existsSync(analyzedPath)) {
    analysisJson = readFileSync(analyzedPath, "utf8");
    withAnalysis++;
  }

  await db.execute({
    sql: `INSERT INTO policies
            (uuid, plan_code, company, product_name, pdf_drive_id, filename, category, status, analysis_json, uploaded_at, archived_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(uuid) DO UPDATE SET
            plan_code=excluded.plan_code, company=excluded.company, product_name=excluded.product_name,
            pdf_drive_id=excluded.pdf_drive_id, filename=excluded.filename, category=excluded.category,
            status=excluded.status,
            analysis_json=COALESCE(excluded.analysis_json, policies.analysis_json),
            uploaded_at=excluded.uploaded_at, archived_at=excluded.archived_at, updated_at=datetime('now')`,
    args: [
      uuid,
      v.planCode ?? uuid,
      v.company ?? null,
      v.productName ?? null,
      v.pdfDriveId ?? null,
      v.filename ?? null,
      v.category ?? null,
      v.status ?? "uploaded",
      analysisJson,
      v.uploadedAt ?? null,
      v.archivedAt ?? null,
    ],
  });
  migrated++;
}

// 對帳
const counts = await db.execute(
  "SELECT status, COUNT(*) AS n FROM policies GROUP BY status ORDER BY status"
);
console.log(`遷移完成：${migrated} 筆（其中 ${withAnalysis} 筆含分析），跳過 ${skipped} 筆`);
console.log("各狀態筆數：");
for (const r of counts.rows) console.log(`  ${r.status}: ${r.n}`);
process.exit(0);
