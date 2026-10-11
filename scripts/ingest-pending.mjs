// node scripts/ingest-pending.mjs
// 從 drive_index.json + drive_registry.json 把「有條款 PDF、尚未分析」的商品
// 灌進 policies 表，status='pending_analysis'，pdf_drive_id = 條款 fileId。
import { readFileSync } from "fs";
import { join } from "path";
import { connect, NOW, ROOT } from "./lib/pg.mjs";

const db = await connect();

const DB_DIR = process.env.DB_DIR || join(ROOT, "..", "100_Todo/projects");
const index = JSON.parse(readFileSync(join(DB_DIR, "drive_index.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(DB_DIR, "drive_registry.json"), "utf8"));

// planCode -> registry entry
const regByPlan = {};
for (const v of Object.values(registry)) if (v.planCode) regByPlan[v.planCode] = v;

const LIMIT = Number(process.argv[2]) || 0; // 0 = 全部
let ingested = 0, skipped = 0, count = 0;

// 一次撈回所有既有狀態，避免每筆一次 SELECT（索引擴大到上萬筆後往返成本會爆掉）
const existing = new Map();
for (const r of (await db.query("SELECT uuid, status FROM policies")).rows) {
  existing.set(r.uuid, r.status);
}

const pending = [];
for (const [plan, info] of Object.entries(index)) {
  if (!info.clauseId) { skipped++; continue; }
  if (LIMIT && count >= LIMIT) break;

  // 已存在且已分析（uploaded/archived）→ 不覆蓋
  if (["uploaded", "archived"].includes(existing.get(plan))) { skipped++; continue; }

  const reg = regByPlan[plan] ?? {};
  pending.push([plan, plan, reg.company ?? null, reg.productName ?? info.productFolder ?? null,
                info.clauseId, info.rateId ?? null, reg.productType ?? null]);
  ingested++; count++;
}

for (let i = 0; i < pending.length; i += 200) {
  const chunk = pending.slice(i, i + 200);
  const params = chunk.flat();
  const values = chunk.map((_, j) => `(${[1,2,3,4,5,6,7].map(k => `$${j*7+k}`).join(",")}, 'pending_analysis', ${NOW})`).join(",");
  await db.query(
    `INSERT INTO policies (uuid, plan_code, company, product_name, pdf_drive_id, rate_drive_id, category, status, updated_at)
     VALUES ${values}
     ON CONFLICT (uuid) DO UPDATE SET
       pdf_drive_id=excluded.pdf_drive_id, rate_drive_id=excluded.rate_drive_id, company=excluded.company,
       product_name=excluded.product_name, category=excluded.category,
       status='pending_analysis', updated_at=${NOW}`,
    params);
  console.log(`  寫入 ${Math.min(i + 200, pending.length)}/${pending.length}`);
}

const c = await db.query("SELECT status, COUNT(*) n FROM policies GROUP BY status ORDER BY status");
console.log(`Ingest 完成：新增/更新 ${ingested} 筆 pending_analysis，略過 ${skipped} 筆`);
console.log("policies 各狀態：");
for (const r of c.rows) console.log(`  ${r.status}: ${r.n}`);
await db.end();
