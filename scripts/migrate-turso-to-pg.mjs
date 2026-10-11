#!/usr/bin/env node
/**
 * Turso（SQLite）→ Postgres（Neon）資料搬遷。可重複執行：每次都清空目標再整批複製，
 * 所以「正式切換」就是在暫停排程後再跑一次。
 *
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=…（唯讀金鑰即可）
 *   DATABASE_URL=postgres://…（目標，需已跑過 npm run db:migrate）
 *
 *   node scripts/migrate-turso-to-pg.mjs --check   只檢查：欄位差異、孤兒資料、筆數，不寫入
 *   node scripts/migrate-turso-to-pg.mjs           檢查通過才搬，搬完逐表核對
 */
import { createClient } from "@libsql/client";
import pg from "pg";
import crypto from "crypto";

const CHECK_ONLY = process.argv.includes("--check");

// 依外鍵相依順序：被參照的表先搬
const TABLES = [
  { name: "companies", pk: ["id"], identity: true },
  { name: "products", pk: ["id"], identity: true },
  { name: "analyses", pk: ["id"], identity: true },
  { name: "corrections", pk: ["id"], identity: true },
  { name: "advisors", pk: ["id"] },
  { name: "policy_assignments", pk: ["id"] },
  { name: "users", pk: ["id"] },
  { name: "usage_counters", pk: ["user_id", "period", "action"] },
  { name: "subscriptions", pk: ["id"] },
  { name: "payments", pk: ["id"], identity: true },
  { name: "policies", pk: ["uuid"] },
];
const ORPHANS = [
  ["products", "company_id", "companies", "id"],
  ["analyses", "product_id", "products", "id"],
  ["corrections", "product_id", "products", "id"],
];

for (const k of ["TURSO_DATABASE_URL", "DATABASE_URL"]) {
  if (!process.env[k]) { console.error(`缺少 ${k}`); process.exit(1); }
}
const src = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const dst = new pg.Client({ connectionString: process.env.DATABASE_URL });
await dst.connect();

const q = id => `"${id.replace(/"/g, '""')}"`;
const fingerprint = keys => crypto.createHash("sha256").update(keys.sort().join("\n")).digest("hex").slice(0, 16);
const keyOf = (row, pk) => pk.map(c => String(row[c])).join("|");

let problems = 0;

// ── 1. 欄位差異：Turso 實際有、schema 沒有的欄位會在搬遷時遺失，必須先處理 ──
const dstCols = {};
for (const t of TABLES) {
  const srcInfo = await src.execute(`PRAGMA table_info(${q(t.name)})`);
  const srcCols = srcInfo.rows.map(r => r.name);
  const { rows } = await dst.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t.name]);
  dstCols[t.name] = rows.map(r => r.column_name);
  if (srcCols.length === 0) { console.error(`✗ Turso 沒有 ${t.name} 表`); problems++; continue; }
  const lost = srcCols.filter(c => !dstCols[t.name].includes(c));
  const added = dstCols[t.name].filter(c => !srcCols.includes(c));
  if (lost.length) { console.error(`✗ ${t.name}：Turso 有但 schema 沒有的欄位 → ${lost.join(", ")}`); problems++; }
  if (added.length) console.log(`  ${t.name}：schema 新增欄位（用預設值） → ${added.join(", ")}`);
  t.cols = srcCols.filter(c => dstCols[t.name].includes(c));
}
// Turso 有、但不在清單裡的表也要知道
const allSrc = await src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
const extra = allSrc.rows.map(r => r.name).filter(n => !TABLES.some(t => t.name === n));
if (extra.length) { console.error(`✗ Turso 還有未納入搬遷的表 → ${extra.join(", ")}`); problems++; }
// 結構對不上就不往下查（缺表時孤兒檢查與讀資料都會直接失敗）
if (problems) { console.error(`\n結構有 ${problems} 個問題，未寫入任何資料。`); process.exit(2); }

// ── 2. 孤兒資料：Postgres 會強制外鍵，舊 SQLite 沒有 ──
for (const [t, col, ref, refCol] of ORPHANS) {
  const r = await src.execute(
    `SELECT COUNT(*) n FROM ${q(t)} WHERE ${q(col)} IS NOT NULL AND ${q(col)} NOT IN (SELECT ${q(refCol)} FROM ${q(ref)})`);
  const n = Number(r.rows[0].n);
  if (n) { console.error(`✗ ${t}.${col}：${n} 筆指向不存在的 ${ref}`); problems++; }
}

// ── 3. 讀出全部資料 ──
const data = {};
for (const t of TABLES) {
  const r = await src.execute(`SELECT * FROM ${q(t.name)}`);
  data[t.name] = r.rows;
  console.log(`  ${t.name.padEnd(20)} ${String(r.rows.length).padStart(6)} 筆`);
}

if (problems) { console.error(`\n有 ${problems} 個問題，未寫入任何資料。`); process.exit(2); }
if (CHECK_ONLY) { console.log("\n檢查通過（--check，未寫入）。"); process.exit(0); }

// ── 4. 單一交易內：清空 → 複製 → 接續序號 ──
await dst.query("BEGIN");
try {
  await dst.query(`TRUNCATE ${TABLES.map(t => q(t.name)).join(", ")} RESTART IDENTITY CASCADE`);
  for (const t of TABLES) {
    const rows = data[t.name];
    const BATCH = Math.max(1, Math.floor(60000 / t.cols.length));   // Postgres 單句參數上限 65535
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = chunk.map(row => `(${t.cols.map(c => { params.push(row[c] ?? null); return `$${params.length}`; }).join(",")})`);
      await dst.query(
        `INSERT INTO ${q(t.name)} (${t.cols.map(q).join(",")}) ${t.identity ? "OVERRIDING SYSTEM VALUE" : ""} VALUES ${tuples.join(",")}`,
        params);
    }
    if (t.identity) {
      await dst.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${q(t.name)}), 0) + 1, false)`, [t.name]);
    }
  }
  await dst.query("COMMIT");
} catch (e) {
  await dst.query("ROLLBACK");
  console.error("✗ 寫入失敗，已回滾：", e.message);
  process.exit(3);
}

// ── 5. 逐表核對：筆數 ＋ 全部主鍵的指紋 ──
let bad = 0;
for (const t of TABLES) {
  const { rows } = await dst.query(`SELECT ${t.pk.map(q).join(",")} FROM ${q(t.name)}`);
  const a = fingerprint(data[t.name].map(r => keyOf(r, t.pk)));
  const b = fingerprint(rows.map(r => keyOf(r, t.pk)));
  const ok = rows.length === data[t.name].length && a === b;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${t.name.padEnd(20)} ${String(rows.length).padStart(6)} / ${data[t.name].length}`);
}
await dst.end();
if (bad) { console.error(`\n${bad} 張表核對不符！`); process.exit(4); }
console.log("\n全部核對一致。");
