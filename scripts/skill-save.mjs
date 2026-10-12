// node scripts/skill-save.mjs <analysisJsonFile>
// Agent Skill 批次分析步驟 3：把 Claude Code 分析產出的 JSON 寫進 Turso policies.analysis_json，
// status → uploaded（轉入待審核佇列）。
// uuid 是 req:<id> 的（顧問送來的條款）寫回 analysis_requests；data 可多帶 category（險種，給十格分類用）
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
  // 顧問「資料庫沒有這張」送來的（uuid＝req:<id>）：結果寫回 analysis_requests，PDF 清掉
  if (rec.uuid.startsWith("req:")) {
    const r = await db.query(
      `UPDATE analysis_requests SET result_json=$1, status='done', done_at=${NOW}, company=$2, product_name=$3, category=$4, pdf=NULL WHERE id=$5 AND status='queued'`,
      [JSON.stringify(enriched), rec.data.company ?? null, rec.data.productName ?? null, rec.data.category ?? rec.category ?? null, rec.uuid.slice(4)]);
    console.log(r.rowCount ? `✓ 顧問送來的 ${rec.uuid}（${rec.data.productName ?? ""}）→ 分析好了，${(rec.data.items ?? []).length} 項` : `✗ ${rec.uuid} 不在佇列，跳過`);
    if (r.rowCount) saved++;
    continue;
  }
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
