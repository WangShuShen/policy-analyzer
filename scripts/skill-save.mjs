// node scripts/skill-save.mjs <analysisJsonFile>
// Agent Skill 批次分析步驟 3：把 Claude Code 分析產出的 JSON 寫進 Turso policies.analysis_json，
// status → uploaded（轉入待審核佇列）。
// JSON 格式：{ uuid, data: { company, productName, baseUnit, plans, items:[{name,valueSource,unit,amount/tableRange/insuredRate/planValues,restriction,pageRef}], annualLimit, waitingPeriod, exclusions, specialRestrictions } }
import { readFileSync } from "fs";
import { connect, NOW } from "./lib/pg.mjs";

const file = process.argv[2];
if (!file) { console.error("用法: node scripts/skill-save.mjs <analysisJsonFile>"); process.exit(1); }
const payload = JSON.parse(readFileSync(file, "utf8"));
const records = Array.isArray(payload) ? payload : [payload];

const db = await connect();
const today = new Date().toISOString().slice(0, 10);
let saved = 0;
for (const rec of records) {
  if (!rec.uuid || !rec.data) { console.log("✗ 缺 uuid/data，跳過"); continue; }
  const enriched = { ...rec.data, _analyzedAt: today, _analyzedBy: "agent-skill" };
  const r = await db.query(
    `UPDATE policies SET analysis_json=$1, status='uploaded', uploaded_at=$2, updated_at=${NOW} WHERE uuid=$3`,
    [JSON.stringify(enriched), today, rec.uuid],
  );
  if (r.rowCount === 0) { console.log(`✗ ${rec.uuid} 不存在，跳過`); continue; }
  console.log(`✓ ${rec.uuid} (${rec.data.productName ?? ""}) → uploaded，${(rec.data.items??[]).length} 項`);
  saved++;
}
console.log(`完成：寫入 ${saved} 筆`);
await db.end();
