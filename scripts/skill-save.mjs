// node scripts/skill-save.mjs <analysisJsonFile>
// Agent Skill 批次分析步驟 3：把 Claude Code 分析產出的 JSON 寫進 Turso policies.analysis_json，
// status → uploaded（轉入待審核佇列）。
// JSON 格式：{ uuid, data: { company, productName, baseUnit, plans, items:[{name,valueSource,unit,amount/tableRange/insuredRate/planValues,restriction,pageRef}], annualLimit, waitingPeriod, exclusions, specialRestrictions } }
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^(\w+)="?([^"]*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.TURSO_DATABASE_URL || readFileSync("/tmp/turso_url.txt", "utf8").trim();
const token = process.env.TURSO_AUTH_TOKEN || readFileSync("/tmp/turso_token.txt", "utf8").trim();
const db = createClient({ url, authToken: token });

const file = process.argv[2];
if (!file) { console.error("用法: node scripts/skill-save.mjs <analysisJsonFile>"); process.exit(1); }
const payload = JSON.parse(readFileSync(file, "utf8"));
const records = Array.isArray(payload) ? payload : [payload];

const today = new Date().toISOString().slice(0, 10);
let saved = 0;
for (const rec of records) {
  if (!rec.uuid || !rec.data) { console.log("✗ 缺 uuid/data，跳過"); continue; }
  const enriched = { ...rec.data, _analyzedAt: today, _analyzedBy: "agent-skill" };
  await db.execute({
    sql: `UPDATE policies SET analysis_json=?, status='uploaded', uploaded_at=?, updated_at=datetime('now') WHERE uuid=?`,
    args: [JSON.stringify(enriched), today, rec.uuid],
  });
  console.log(`✓ ${rec.uuid} (${rec.data.productName ?? ""}) → uploaded，${(rec.data.items??[]).length} 項`);
  saved++;
}
console.log(`完成：寫入 ${saved} 筆`);
process.exit(0);
