/**
 * 用法: node scripts/seed-admin.mjs <email> <name>
 * 例如: node scripts/seed-admin.mjs woody38921218@gmail.com "Woody"
 * 同 email 已存在就更新為管理者、保留原 id（舊版 INSERT OR REPLACE 會換掉 id，審核指派因此對不上）。
 */
import { randomUUID } from "crypto";
import { connect } from "./lib/pg.mjs";

const [, , email, name] = process.argv;
if (!email || !name) {
  console.error("用法: node scripts/seed-admin.mjs <email> <name>");
  process.exit(1);
}

const db = await connect();
await db.query(
  `INSERT INTO advisors (id, email, name, is_admin, is_active) VALUES ($1, $2, $3, 1, 1)
   ON CONFLICT (email) DO UPDATE SET name = excluded.name, is_admin = 1, is_active = 1`,
  [randomUUID(), email.toLowerCase().trim(), name.trim()],
);
console.log(`✅ 管理者帳號建立成功：${email} (${name})`);
await db.end();
