/**
 * 用法: node scripts/seed-admin.mjs <email> <name>
 * 例如: node scripts/seed-admin.mjs woody38921218@gmail.com "Woody"
 */

import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config();

const [, , email, name] = process.argv;

if (!email || !name) {
  console.error("用法: node scripts/seed-admin.mjs <email> <name>");
  process.exit(1);
}

const db = createClient({ url: "file:./data/policies.db" });

await db.batch([
  `CREATE TABLE IF NOT EXISTS advisors (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
], "write");

const id = randomUUID();
await db.execute({
  sql: "INSERT OR REPLACE INTO advisors (id, email, name, is_admin, is_active) VALUES (?, ?, ?, 1, 1)",
  args: [id, email.toLowerCase().trim(), name.trim()],
});

console.log(`✅ 管理者帳號建立成功：${email} (${name})`);
db.close();
