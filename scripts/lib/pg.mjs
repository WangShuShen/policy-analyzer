// 營運腳本共用的 Postgres 連線。連線字串取 DATABASE_URL（環境變數 → .env.local → .env 依序）。
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

for (const f of [".env.local", ".env"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^(\w+)="?([^"]*?)"?$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/** 與 lib/schema.ts 的 nowText 相同格式（UTC "YYYY-MM-DD HH:MM:SS"） */
export const NOW = "to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

export async function connect() {
  if (!process.env.DATABASE_URL) {
    console.error("缺少 DATABASE_URL（Neon 連線字串）。可用 export 或寫進 .env.local。");
    process.exit(1);
  }
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
}
