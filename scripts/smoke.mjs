#!/usr/bin/env node
/*
 * 冒煙測試（上線流程手冊 docs/RELEASE.md 第 5 步、開發版每次部署後也跑）。
 * 只讀不寫：不登入、不建資料，上線版也能放心跑。約 10 秒。
 * 檢查：首頁／登入頁打得開、沒登入進不了顧問與客戶頁、不存在的頁回 404、
 *       排程 API 沒密碼擋 401，以及「開發版才有的東西」在上線版確實不存在（測試登入、回饋鈕）。
 *
 * 用法：
 *   node scripts/smoke.mjs --env dev                 # 測 https://radia-dev-woad.vercel.app
 *   node scripts/smoke.mjs --env prod                # 測 https://policy-analyzer-three.vercel.app
 *   node scripts/smoke.mjs --env dev --base http://localhost:3001
 * 全過 exit 0；任一條沒過 exit 1，並印出哪條。
 */
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ENV = arg("env");
if (ENV !== "dev" && ENV !== "prod") { console.error("要指定 --env dev 或 --env prod"); process.exit(2); }
const BASE = (arg("base") ?? (ENV === "dev" ? "https://radia-dev-woad.vercel.app" : "https://policy-analyzer-three.vercel.app")).replace(/\/$/, "");

const get = (p, init = {}) => fetch(BASE + p, { redirect: "manual", ...init });
const goesTo = (r, re) => r.status >= 300 && r.status < 400 && re.test(r.headers.get("location") ?? "");

const checks = [
  ["首頁打得開（沒登入會導去登入）", async () => { const r = await get("/"); return r.status === 200 || goesTo(r, /\/login|\/welcome/) || `HTTP ${r.status}`; }],
  ["登入頁打得開", async () => { const r = await get("/login"); return r.status === 200 || `HTTP ${r.status}`; }],
  ["沒登入進不了顧問待辦（導去登入）", async () => { const r = await get("/todo"); return goesTo(r, /\/login/) || `HTTP ${r.status} → ${r.headers.get("location")}`; }],
  ["沒登入進不了保單分析（導去登入）", async () => { const r = await get("/analyze"); return goesTo(r, /\/login/) || `HTTP ${r.status} → ${r.headers.get("location")}`; }],
  ["沒登入進不了客戶的我的頁（導去同意書）", async () => { const r = await get("/me"); return goesTo(r, /\/welcome\/consent|\/login/) || `HTTP ${r.status} → ${r.headers.get("location")}`; }],
  ["不存在的頁回 404（公開區）", async () => { const r = await get("/welcome/smoke-no-such-page-" + Date.now()); return r.status === 404 || `HTTP ${r.status}`; }],
  ["排程 API 沒密碼擋下（401）", async () => { const r = await get("/api/cron/bookings"); return r.status === 401 || `HTTP ${r.status}`; }],
  ["測試登入不帶鑰匙一律 404", async () => { const r = await get("/api/dev-login?as=new-customer"); return r.status === 404 || `HTTP ${r.status}（上線版出現這個要立刻處理）`; }],
  ENV === "dev"
    ? ["開發版有回饋鈕", async () => { const r = await get("/api/dev/feedback?probe=1"); const j = r.ok ? await r.json() : {}; return (r.ok && j.enabled === true) || `HTTP ${r.status}`; }]
    : ["上線版沒有回饋鈕", async () => { const r = await get("/api/dev/feedback?probe=1"); return r.status === 404 || `HTTP ${r.status}（RADIA_ENV 被設到上線版了？）`; }],
];

console.log(`冒煙測試：${ENV === "dev" ? "開發版" : "上線版"} ${BASE}\n`);
let failed = 0;
for (const [name, fn] of checks) {
  let res;
  try { res = await fn(); } catch (e) { res = String(e?.cause?.code ?? e?.message ?? e); }
  if (res === true) console.log(`✓ ${name}`);
  else { failed++; console.log(`✗ ${name}：${res}`); }
}
console.log(`\n${checks.length - failed}/${checks.length} 通過`);
process.exit(failed ? 1 : 0);
