// node scripts/dedupe-assignments.mjs [--apply]
// policy_assignments 每張保單只保留一列：優先保留 completed，否則保留最早一列。
// 起因：assign-daily 舊版只排除「今日已指派」，導致同一張保單每天被重複指派。
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || readFileSync("/tmp/turso_url.txt", "utf8").trim(),
  authToken: process.env.TURSO_AUTH_TOKEN || readFileSync("/tmp/turso_token.txt", "utf8").trim(),
});
const APPLY = process.argv.includes("--apply");

const rows = (await db.execute(
  "SELECT id, policy_uuid, advisor_id, assigned_date, status, completed_at FROM policy_assignments ORDER BY policy_uuid, assigned_date ASC"
)).rows;

const byPolicy = new Map();
for (const r of rows) {
  if (!byPolicy.has(r.policy_uuid)) byPolicy.set(r.policy_uuid, []);
  byPolicy.get(r.policy_uuid).push(r);
}

const keep = [], drop = [];
for (const [, list] of byPolicy) {
  const done = list.find(r => r.status === "completed");
  const winner = done ?? list[0];           // 有審完的保留該列，否則保留最早指派
  keep.push(winner);
  for (const r of list) if (r.id !== winner.id) drop.push(r);
}

console.log(`policy_assignments 總列數 : ${rows.length}`);
console.log(`不重複保單             : ${byPolicy.size}`);
console.log(`保留                   : ${keep.length}`);
console.log(`刪除                   : ${drop.length}`);
const keepBy = {}, dropBy = {};
for (const r of keep) keepBy[r.status] = (keepBy[r.status] ?? 0) + 1;
for (const r of drop) dropBy[r.status] = (dropBy[r.status] ?? 0) + 1;
console.log("保留 status 分布:", keepBy);
console.log("刪除 status 分布:", dropBy);
console.log("保留 completed 的保單數:", keep.filter(r => r.status === "completed").length);

if (!APPLY) { console.log("\n[dry-run] 未寫入。確認無誤後加 --apply 執行。"); process.exit(0); }

for (let i = 0; i < drop.length; i += 100) {
  const batch = drop.slice(i, i + 100);
  await db.batch(batch.map(r => ({ sql: "DELETE FROM policy_assignments WHERE id = ?", args: [r.id] })), "write");
  console.log(`  已刪 ${Math.min(i + 100, drop.length)}/${drop.length}`);
}
const after = await db.execute("SELECT status, COUNT(*) n FROM policy_assignments GROUP BY status");
console.log("完成。現況:", after.rows.map(r => `${r.status}=${r.n}`).join(", "));
process.exit(0);
