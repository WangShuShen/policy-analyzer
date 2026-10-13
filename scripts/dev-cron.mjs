#!/usr/bin/env node
/*
 * 開發版手動排程（docs/RELEASE.md「開發版驗收」）。
 * GitHub 排程只從 main 跑、打的是上線版，所以開發版沒有排程；驗收「前一天提醒信」這類功能時用這支代跑。
 * v1.0 上線時改成 dev-cron workflow（列在 RELEASE.md 上線清單）。
 *
 * 用法：
 *   node scripts/dev-cron.mjs                     # 依序跑全部：預約提醒＋寄信重試、AI 用量警報
 *   node scripts/dev-cron.mjs --only bookings     # 只跑一支（bookings｜ai-usage，可逗號分隔）
 *   node scripts/dev-cron.mjs --base http://localhost:3001
 * 密碼：開發版專用的 CRON_SECRET，放在 ~/.config/radia/dev-cron.env（權限 600），只讀不印；也可用環境變數 DEV_CRON_SECRET。
 *       要換位置用 --env <檔案>。上線版的密碼永遠不放這裡。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://radia-dev-woad.vercel.app").replace(/\/$/, "");
if (/policy-analyzer-three/.test(BASE)) { console.error("這支只打開發版，上線版的排程由 GitHub Actions 跑"); process.exit(2); }

const envFile = arg("env", path.join(os.homedir(), ".config/radia/dev-cron.env"));
// 不讀環境變數裡的 CRON_SECRET：那可能是本機或上線版的（用 --env-file=.env.local 跑別的腳本時會混進來）
let secret = process.env.DEV_CRON_SECRET ?? "";
if (!secret && fs.existsSync(envFile)) secret = /^CRON_SECRET=(.+)$/m.exec(fs.readFileSync(envFile, "utf8"))?.[1]?.trim() ?? "";
if (!secret) { console.error(`找不到 CRON_SECRET（${envFile}）`); process.exit(2); }

// 預約提醒（前一天／前 1 小時）與寄信重試在同一支 API
const JOBS = {
  bookings: { label: "預約提醒＋寄信重試", method: "GET", path: "/api/cron/bookings" },
  "ai-usage": { label: "AI 用量警報", method: "POST", path: "/api/cron/ai-usage" },
};
const only = arg("only")?.split(",").map(s => s.trim()).filter(Boolean) ?? Object.keys(JOBS);
for (const k of only) if (!JOBS[k]) { console.error(`沒有排程 ${k}（可用：${Object.keys(JOBS).join("、")}）`); process.exit(2); }

console.log(`開發版排程：${BASE}\n`);
let failed = 0;
for (const k of only) {
  const j = JOBS[k];
  const r = await fetch(BASE + j.path, { method: j.method, headers: { "x-cron-secret": secret } }).catch(e => ({ ok: false, status: String(e?.cause?.code ?? e) }));
  const body = r.ok ? await r.json().catch(() => null) : null;
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${j.label}（HTTP ${r.status}）${body ? "\n  " + JSON.stringify(body) : ""}`);
}
process.exit(failed ? 1 : 0);
