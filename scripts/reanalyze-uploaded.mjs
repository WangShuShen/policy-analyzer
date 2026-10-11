// node scripts/reanalyze-uploaded.mjs
// 把目前 status='uploaded' 的保單設回 pending_analysis，補上 drive_index 真實條款 fileId，
// 以便用新版 prompt 重新分析。回報哪些可重跑、哪些缺 PDF。
import { readFileSync } from "fs";
import { join } from "path";
import { connect, NOW, ROOT } from "./lib/pg.mjs";

const db = await connect();

const DB_DIR = process.env.DB_DIR || join(ROOT, "..", "100_Todo/projects");
const index = JSON.parse(readFileSync(join(DB_DIR, "drive_index.json"), "utf8"));

const r = await db.query("SELECT uuid, plan_code, product_name, pdf_drive_id FROM policies WHERE status='uploaded'");
console.log(`目前 uploaded：${r.rows.length} 筆`);

let ready = 0, noPdf = 0;
for (const row of r.rows) {
  const plan = row.plan_code;
  const idx = index[plan];
  const clauseId = idx?.clauseId;
  if (clauseId) {
    await db.query(
      `UPDATE policies SET pdf_drive_id=$1, status='pending_analysis', updated_at=${NOW} WHERE uuid=$2`,
      [clauseId, row.uuid]);
    console.log(`  ✓ ${row.product_name} (${plan}) → pending_analysis`);
    ready++;
  } else {
    console.log(`  ✗ ${row.product_name} (${plan}) → drive_index 無條款 PDF，跳過`);
    noPdf++;
  }
}
console.log(`\n可重跑 ${ready} 筆，缺 PDF ${noPdf} 筆`);
await db.end();
