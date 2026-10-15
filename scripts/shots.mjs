#!/usr/bin/env node
/*
 * 驗收截圖（派工 10/15）：對開發版拍每個驗收項目的畫面，手機 390×844／平板 820×1180／電腦 1440×900，整頁 JPEG 70。
 * 每張自動檢查：橫向捲動、超出畫面右邊、手機可點元件小於 40×40、客戶端出現「三商」、主控台錯誤。只記錄不修。
 * 輸出 <驗收ID>-<序號>-<mobile|tablet|desktop>.jpg ＋ manifest.json（驗收清單頁讀這份）。
 *
 * 用法（跑法也寫在 docs/RELEASE.md）：開發版是真 AI，存摺讀取要真檔案，所以平常對本機（模擬 AI＋wt-a 資料庫）拍：
 *   AI_MOCK=1 npx next start -p 3001   （先 npm run build）
 *   DEV_DB_URL="$(node --env-file=.env.local -p process.env.DATABASE_URL)" \
 *     node scripts/shots.mjs --base http://localhost:3001 --any-db --pw <裝了 playwright 的資料夾> --out ../../100_Todo/projects/RADIA-驗收截圖
 *   --base  預設 https://radia-dev-woad.vercel.app（上線版一律拒絕）
 *   --env-label  manifest 的 env 欄位（預設：本機＝「本機（模擬 AI）」，其他＝「開發版」）
 *   --pw    playwright 不加進 repo 的 dependencies：在暫存資料夾 npm i playwright@1.60.0，這裡指那個資料夾
 *   --only  只拍某幾項，例：--only w1-04,w2-03（資料照樣全部現做）
 *
 * ⚠️ 用獨立的 headless 瀏覽器，不碰 Playwright MCP 共用瀏覽器（卡 B 的三商登入）。
 * 會在開發版現做測試資料：測試客戶（dev-login new-customer）、諮詢對話、模擬存摺、預約、一位手動客戶、互動紀錄。
 * 拍完把這次建的預約改成 cancelled_by_advisor（不刪資料、不寄信）。w1b-10 會暫時把每人每天上限調到 0.000001，拍完一定還原。
 * 測試登入鑰匙讀 DEV_LOGIN_KEY 環境變數或 ~/.config/radia/dev-login.env（不印）；資料庫只用 DEV_DB_URL，主機必須是開發版主庫。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import pg from "pg";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://radia-dev-woad.vercel.app").replace(/\/$/, "");
const OUT = arg("out");
const PW = arg("pw", process.env.PLAYWRIGHT_DIR);
const ONLY = arg("only")?.split(",");
const ADV = arg("advisor", "dev-adv-a");
const DEV_DB_HOST = /^ep-green-fog-b7nr4otn/;
if (!OUT) { console.error("要指定 --out <輸出資料夾>"); process.exit(2); }
if (/policy-analyzer|radia\.tw/.test(BASE)) { console.error("上線版不拍（只對開發版／本機）"); process.exit(2); }

let chromium;
try { ({ chromium } = createRequire(PW ? path.join(path.resolve(PW), "x.js") : import.meta.url)("playwright")); }
catch { console.error("找不到 playwright：先在暫存資料夾 npm i playwright@1.60.0，再用 --pw <那個資料夾>（不要加進 repo 的 dependencies）"); process.exit(2); }

const keyFile = path.join(os.homedir(), ".config/radia/dev-login.env");
let KEY = process.env.DEV_LOGIN_KEY ?? "";
if (!KEY && fs.existsSync(keyFile)) KEY = /^DEV_LOGIN_KEY=(.+)$/m.exec(fs.readFileSync(keyFile, "utf8"))?.[1]?.trim() ?? "";
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
if (!KEY && !LOCAL) { console.error(`找不到 DEV_LOGIN_KEY（${keyFile}）`); process.exit(2); }

let db = null;
if (process.env.DEV_DB_URL) {
  const host = new URL(process.env.DEV_DB_URL).hostname;
  if (!DEV_DB_HOST.test(host) && !process.argv.includes("--any-db")) { console.error(`DEV_DB_URL 不是開發版主庫（${host}）`); process.exit(2); }
  db = new pg.Client({ connectionString: process.env.DEV_DB_URL }); await db.connect();
} else console.log("⚠️ 沒有 DEV_DB_URL：拍不到「面談後」的畫面（要把預約時間移到過去），拍完也沒辦法自動取消測試預約");

fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = { mobile: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 登入與 API ──
async function login(q) {
  const r = await fetch(`${BASE}/api/dev-login?${q}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
  const c = (r.headers.getSetCookie?.() ?? []).find(x => x.startsWith("auth_token="));
  if (!c) throw new Error(`測試登入失敗（${q.split("&")[0]}）HTTP ${r.status}`);
  const token = c.split(";")[0].slice("auth_token=".length);
  return { token, id: JSON.parse(Buffer.from(token.split(".")[1], "base64url")).advisorId };
}
async function api(who, method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { cookie: `auth_token=${who.token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p} HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}
// 諮詢：開一段新對話，照劇本點選項／打字。劇本元素：正規表示式＝點符合的選項｜字串＝打字｜null＝點第一個「不跳過」的選項
async function consult(who, steps) {
  let s = await api(who, "POST", "/api/consult", {});
  for (const st of steps) {
    const opts = s.pending?.ask?.options ?? [];
    let body;
    if (typeof st === "string") body = { text: st };
    else {
      let i = st ? opts.findIndex(o => st.test(o)) : opts.findIndex(o => !/直接約|去約顧問|現在去約|先不|不想|跳過/.test(o));
      if (i < 0) i = 0;
      if (!opts.length) break;
      body = { option: i };
    }
    s = await api(who, "POST", "/api/consult/turn", { conversationId: s.conversation.id, stepId: s.pending?.ask?.stepId, ...body });
  }
  return s;
}
async function untilUpload(who, s) {
  for (let i = 0; i < 14 && s.pending?.kind === "ask"; i++) {
    const opts = s.pending.ask.options ?? [];
    let k = opts.findIndex(o => !/直接約|去約顧問|現在去約|先不|不想|跳過/.test(o)); if (k < 0) k = 0;
    s = await api(who, "POST", "/api/consult/turn", { conversationId: s.conversation.id, stepId: s.pending.ask.stepId, ...(opts.length ? { option: k } : { text: "大概 500 萬" }) });
  }
  return s;
}
async function waitPassbook(who, want) {
  for (let i = 0; i < 60; i++) {
    const v = await api(who, "GET", "/api/passbook");
    if (v.upload?.status === want) return v;
    if (v.upload?.status === "failed") throw new Error(`存摺讀取失敗：${v.upload.error}`);
    await sleep(1000);
  }
  throw new Error(`等不到存摺狀態 ${want}`);
}
const madeBookings = [];
// 每次重抓時段、從最後 15 個隨機挑（前一次跑剩下的、別人剛約的都可能撞到），撞到就換
async function book(who) {
  for (let i = 0; i < 4; i++) {
    const slots = (await api(who, "GET", `/api/advisors/${ADV}/slots`)).slots ?? [];
    if (!slots.length) throw new Error(`顧問 ${ADV} 沒有可約時段`);
    const pick = slots.slice(-15)[Math.floor(Math.random() * Math.min(15, slots.length))];
    try {
      const b = await api(who, "POST", "/api/bookings", { advisorId: ADV, startsAt: pick.startsAt, mode: "online" });
      madeBookings.push(b.id); return b;
    } catch (e) { if (!/409/.test(e.message) || i === 3) throw e; }
  }
}
// 整頁截圖：聊天這類「內層自己捲」的區塊，看還有多少沒露出來
function hiddenByScrollers() {
  let extra = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || !/(auto|scroll)/.test(cs.overflowY)) continue;
    extra = Math.max(extra, el.scrollHeight - el.clientHeight);
  }
  return extra;
}

// ── 每張的自動檢查（在頁面裡跑） ──
function pageChecks({ mobile, customer, allowSanshang }) {
  const W = document.documentElement.clientWidth, out = [];
  const sw = document.documentElement.scrollWidth;
  if (sw > W) out.push(`橫向捲動：頁寬 ${sw} > ${W}`);
  const desc = el => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 18);
    return `${el.tagName.toLowerCase()}${cls}${t ? `「${t}」` : ""}`;
  };
  const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  const over = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= W + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || clipped(el)) continue;
    if (over.some(o => o.contains(el))) continue;
    over.push(el);
  }
  if (over.length) out.push(`超出畫面右邊 ${over.length} 處：${over.slice(0, 4).map(el => `${desc(el)} 到 ${Math.round(el.getBoundingClientRect().right)}px`).join("；")}`);
  if (mobile) {
    const small = [], nav = [];
    const isNav = el => !!el.closest("header, nav") || /\b(brand|cnb|anb|cacc)\b/.test(typeof el.className === "string" ? el.className : "");
    for (const el of document.querySelectorAll("button, [role=button], a, input:not([type=hidden]), select, textarea, summary")) {
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;   // 段落裡的文字連結不算
      const target = (el.type === "checkbox" || el.type === "radio") && el.closest("label") ? el.closest("label") : el;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(target).visibility === "hidden") continue;
      if (r.width < 40 || r.height < 40) (isNav(el) ? nav : small).push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 頂部導覽列每頁都一樣，分開記，不然每張都被它洗版
    if (nav.length) out.push(`手機按鈕太小・頂部導覽列 ${nav.length} 個：${[...new Set(nav)].slice(0, 8).join("；")}`);
    const uniq = [...new Set(small)];
    if (uniq.length) out.push(`手機按鈕太小（<40×40）${small.length} 個：${uniq.slice(0, 10).join("；")}${uniq.length > 10 ? `；…另 ${uniq.length - 10} 種` : ""}`);
  }
  if (customer && !allowSanshang) {
    const t = document.body.innerText, i = t.indexOf("三商");
    if (i >= 0) out.push(`客戶端出現「三商」：…${t.slice(Math.max(0, i - 12), i + 12).replace(/\s+/g, " ")}…`);
  }
  return out;
}

// ── 拍一個畫面（三種尺寸） ──
// env：驗收清單上顯示，讓顧問知道對話內容是不是模擬的（主管 10/15：開發版是真 AI，截圖改對本機＋模擬 AI 拍）
const manifest = { takenAt: new Date().toISOString(), commit: "", base: BASE, env: arg("env-label", LOCAL ? "本機（模擬 AI）" : "開發版"), items: {} };
try { manifest.commit = execFileSync("git", ["rev-parse", "--short", "dev"], { encoding: "utf8" }).trim(); } catch { /* 不在 repo 裡跑 */ }
const counters = {};
let browser, shots = 0;
const failures = [];
const want = id => !ONLY || ONLY.includes(id);

async function shoot(id, label, spec) {
  manifest.items[id] ??= [];
  if (!want(id)) return;
  const seq = (counters[id] = (counters[id] ?? 0) + 1);
  const entry = { label, path: spec.path, role: spec.role, files: {}, issues: {} };
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: vp === "mobile", hasTouch: vp !== "desktop", locale: "zh-TW", timezoneId: "Asia/Taipei" });
    if (spec.who) await ctx.addCookies([{ name: "auth_token", value: spec.who.token, url: BASE }]);
    const page = await ctx.newPage(), errs = [];
    page.on("console", m => { if (m.type() === "error") errs.push(m.text().replace(/\s+/g, " ").slice(0, 160)); });
    page.on("pageerror", e => errs.push(`頁面錯誤：${String(e.message).slice(0, 160)}`));
    const file = `${id}-${seq}-${vp}.jpg`;
    const issues = [];
    try {
      const url = spec.url ?? BASE + spec.path;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(async e => {   // 開發版偶爾冷啟動逾時，重試一次
        if (!/TIMED_OUT|Timeout/i.test(String(e.message))) throw e;
        await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
      });
      await sleep(spec.wait ?? 1200);
      if (spec.act) await spec.act(page, vp);
      if (spec.print) await page.emulateMedia({ media: "print" });
      await sleep(300);
      issues.push(...await page.evaluate(pageChecks, { mobile: vp === "mobile", customer: spec.role === "客戶" || spec.role === "未登入", allowSanshang: !!spec.allowSanshang }));
      // 內層捲動的區塊：把視窗拉高讓它長開（版面照原本的 CSS 排，只是螢幕變長），檢查在拉高前就做完了
      const extra = spec.noExpand ? 0 : await page.evaluate(hiddenByScrollers);
      if (extra > 4) { await page.setViewportSize({ width: size.width, height: Math.min(size.height + extra, 8000) }); await sleep(600); }
      await page.screenshot({ path: path.join(OUT, file), fullPage: true, type: "jpeg", quality: 70 });
      entry.files[vp] = file; shots++;
      if (spec.expect && !(await page.locator("body").innerText()).match(spec.expect)) issues.push(`畫面上找不到預期的字（${spec.expect}），可能沒拍到對的狀態`);
    } catch (e) {
      issues.push(`拍攝失敗：${String(e.message ?? e).split("\n")[0].slice(0, 200)}`);
      failures.push(`${id}-${seq} ${vp}：${String(e.message ?? e).split("\n")[0].slice(0, 120)}`);
    }
    for (const e of [...new Set(errs)]) issues.push(`主控台錯誤：${e}`);
    entry.issues[vp] = issues;
    await ctx.close();
  }
  manifest.items[id].push(entry);
  const n = Object.values(entry.issues).flat().length;
  console.log(`${n ? "△" : "✓"} ${id}-${seq} ${label}${n ? `（${n} 個問題）` : ""}`);
}
// 同一個畫面給另一個驗收項目用（不重拍，manifest 指向同一組檔案）
function reuse(id, fromId, fromSeq, label) {
  const src = manifest.items[fromId]?.[fromSeq - 1];
  manifest.items[id] ??= [];
  if (src) manifest.items[id].push({ ...src, label });
}
const clickText = (re, opts = {}) => async page => {
  const el = page.getByText(re, opts).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 8000 }); await sleep(800);
};

let saved = null, admin = null;
try {
  browser = await chromium.launch();
  console.log(`對 ${BASE} 拍（dev ${manifest.commit || "?"}）→ ${OUT}\n`);
  const A = await login(`as=advisor&id=${ADV}`);
  admin = await login(`as=admin&id=${ADV}`);

  // ── 測試資料 ──
  const C0 = await login("as=new-customer");                                   // 什麼都還沒做
  const Cmid = await login("as=new-customer");                                 // 保障路線問到一半
  await consult(Cmid, [/保單夠不夠/, /朋友/, /另一半/]);
  const Cfin = await login("as=new-customer");                                 // 財務路線「最擔心」
  await consult(Cfin, [/準備多少錢/]);
  const Crec = await login("as=new-customer");                                 // 問推薦商品
  await consult(Crec, [/保單夠不夠/, "你推薦哪一張？哪家比較好？"]);
  const C1 = await login("as=new-customer");                                   // 主要客戶：走到上傳存摺
  let s1 = await untilUpload(C1, await consult(C1, [/保單夠不夠/, /朋友/, /另一半/, /差不多/]));
  const conv1 = s1.conversation.id;
  if (s1.pending?.kind !== "upload") console.log(`⚠️ C1 沒走到上傳存摺那一步（pending=${s1.pending?.kind}）`);

  // ── w1-01、w1-09 公開頁 ──
  await shoot("w1-01", "首頁 /welcome（未登入）", { path: "/welcome", role: "未登入" });
  await shoot("w1-01", "同意書 /welcome/consent（還沒捲到底，勾選鎖住）", { path: "/welcome/consent", role: "未登入" });
  await shoot("w1-01", "同意書 /welcome/consent（捲到底、勾完）", { path: "/welcome/consent", role: "未登入", act: async page => {
    await page.locator(".csb").evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")); });
    await sleep(500);
    for (const cb of await page.locator(".csopts input[type=checkbox]").all()) await cb.check().catch(() => {});
  } });
  reuse("w1-09", "w1-01", 1, "品牌：/welcome（同 w1-01-1）");
  await shoot("w1-09", "品牌：/news", { path: "/news", role: "未登入" });
  await shoot("w1-09", "品牌：/login", { path: "/login", role: "未登入" });

  // ── w1-02、w1-03 諮詢 ──
  await shoot("w1-02", "/consult 開場三選一（新客戶）", { path: "/consult", role: "客戶", who: C0 });
  await shoot("w1-02", "保障路線問到一半（右欄有整理）", { path: "/consult", role: "客戶", who: Cmid });
  await shoot("w1-02", "財務路線「最擔心」那題", { path: "/consult", role: "客戶", who: Cfin, expect: /擔心/ });
  await shoot("w1-03", "問「推薦哪一張、哪家比較好」的回覆（模擬模式：第二層審查一律通過，只有規則層會擋，拍的是不推薦商品的回覆）", { path: "/consult", role: "客戶", who: Crec });
  reuse("w1b-01", "w1-03", 1, "同 w1-03-1（問推薦商品的安全回覆）");

  // ── w1-05 存摺 ──
  await shoot("w1-05", "上傳存摺畫面（諮詢走到上傳那一步）", { path: `/consult?id=${conv1}`, role: "客戶", who: C1 });
  await api(C1, "POST", "/api/passbook", { conversationId: conv1, content: { kind: "text", pages: ["驗收截圖用存摺：模擬模式下內容不會被讀，讀取會回固定的示範保單。上傳端要求至少 30 個字。"] } });
  // 畫面上傳完會立刻送「上傳好了」（ConsultChat onUploaded），右欄才出現讀取中／確認清單
  s1 = await api(C1, "POST", "/api/consult/turn", { conversationId: conv1, stepId: s1.pending?.uploadStepId, uploaded: true }).catch(e => (console.log(`⚠️ 送出「上傳好了」失敗：${e.message}`), s1));
  const pv = await waitPassbook(C1, "confirming");
  const pbNote = "模擬示範保單；客戶自己的保單出現保險公司名稱不算問題";
  await shoot("w1-05", `「我讀到 ${pv.policies.length} 張，對嗎？」確認畫面（諮詢右欄；${pbNote}）`, { path: `/consult?id=${conv1}`, role: "客戶", who: C1, allowSanshang: true, expect: /對嗎/,
    act: async (page, vp) => { if (vp !== "desktop") await clickText(/我的保障/)(page); } });   // 手機、平板右欄收在「我的保障」分頁
  await shoot("w1-05", `「我讀到 ${pv.policies.length} 張，對嗎？」確認畫面（/analysis；${pbNote}）`, { path: "/analysis", role: "客戶", who: C1, allowSanshang: true, expect: /對嗎/ });
  await api(C1, "POST", "/api/passbook/confirm", { uploadId: pv.upload.id, items: pv.policies.map(x => ({ id: x.id, keep: true })) });
  await waitPassbook(C1, "done");
  await shoot("w1-05", "全險圖（諮詢畫面，上傳完成後）", { path: `/consult?id=${conv1}`, role: "客戶", who: C1, allowSanshang: true });
  await shoot("w1-05", "全險圖（/me 我的保單分頁）", { path: "/me?tab=pol", role: "客戶", who: C1, allowSanshang: true });

  // ── w1-06 預約 ──
  await shoot("w1-06", "/advisors 顧問卡片", { path: "/advisors", role: "客戶", who: C0 });
  await shoot("w1-06", `/advisors/${ADV} 選時段（點了第一個時段）`, { path: `/advisors/${ADV}`, role: "客戶", who: C1, act: async page => {
    const b = page.locator("button.slot:visible:not([disabled])").first();
    await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(800);
  } });
  const b1 = await book(C1);
  await shoot("w1-06", "預約完成畫面", { path: `/booked/${b1.id}`, role: "客戶", who: C1 });
  await shoot("w1-06", "/me 預約與進度", { path: "/me", role: "客戶", who: C1 });
  await shoot("w1-04", "/analysis 面談前（預約了、還沒面談，鎖卡）", { path: "/analysis", role: "客戶", who: C1 });

  // ── w1b-02、w1b-09 /me ──
  await shoot("w1b-02", "改期畫面（/me 按「改時間」進來，點了一個新時段、沒按確認）", { path: `/advisors/${ADV}?reschedule=${b1.id}`, role: "客戶", who: C1, act: async page => {
    const b = page.locator("button.slot:visible:not([disabled])").first();
    await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(800);
  } });
  await shoot("w1b-02", "/me 取消畫面（只打開，沒按確定）", { path: "/me", role: "客戶", who: C1, act: clickText(/取消預約|^取消$/) });
  await shoot("w1b-09", "/me 我的資料分頁", { path: "/me?tab=data", role: "客戶", who: C1 });
  await shoot("w1b-09", "/admin/data-requests", { path: "/admin/data-requests", role: "管理員", who: admin });

  // ── 面談後：C4 預約 → 時間移到過去 → 顧問看到面談結果按鈕 → 標已面談 → 客戶端解鎖 ──
  const C4 = await login("as=new-customer");
  await untilUpload(C4, await consult(C4, [/保單夠不夠/, /朋友/, /另一半/, /差不多/]));
  const b4 = await book(C4);
  if (db) {
    await db.query("update bookings set starts_at=$2, ends_at=$3 where id=$1", [b4.id, new Date(Date.now() - 50 * 60_000).toISOString(), new Date(Date.now() - 5 * 60_000).toISOString()]);
    await shoot("w1-07", "顧問 /todo", { path: "/todo", role: "顧問", who: A });
    await shoot("w1-07", "顧問 /clients", { path: "/clients", role: "顧問", who: A });
    await shoot("w1-07", "顧問 /clients/[id] 諮詢紀錄分頁", { path: `/clients/${C1.id}?tab=chat&conv=${conv1}`, role: "顧問", who: A });
    await shoot("w1-07", "顧問 /clients/[id] 面談結果按鈕（面談時間已過、還沒標）", { path: `/clients/${C4.id}`, role: "顧問", who: A, expect: /已面談|沒出現/ });
    await api(A, "POST", `/api/advisor/bookings/${b4.id}/status`, { action: "met" });
    await shoot("w1-04", "/analysis 面談後（顧問標已面談，解鎖）", { path: "/analysis", role: "客戶", who: C4 });
  } else {
    await shoot("w1-07", "顧問 /todo", { path: "/todo", role: "顧問", who: A });
    await shoot("w1-07", "顧問 /clients", { path: "/clients", role: "顧問", who: A });
    await shoot("w1-07", "顧問 /clients/[id] 諮詢紀錄分頁", { path: `/clients/${C1.id}?tab=chat&conv=${conv1}`, role: "顧問", who: A });
  }

  // ── w1-08 保單／保障分析、商品 ──
  await shoot("w1-08", "顧問 /clients/[id] 保單分頁", { path: `/clients/${C1.id}?tab=pol`, role: "顧問", who: A });
  await shoot("w1-08", "顧問 /clients/[id] 保障分析分頁", { path: `/clients/${C1.id}?tab=gap`, role: "顧問", who: A });
  await shoot("w1-08", "顧問 /catalog", { path: "/catalog", role: "顧問", who: A });
  const planCode = (pv.policies.find(p => p.planCode) ?? {}).planCode
    ?? JSON.stringify(await api(A, "GET", "/api/advisor/catalog?q=&tab=mine").catch(() => ({}))).match(/"planCode":"([^"]+)"/)?.[1]
    ?? JSON.stringify(await api(A, "GET", "/api/advisor/catalog?q=&tab=other").catch(() => ({}))).match(/"planCode":"([^"]+)"/)?.[1];
  if (planCode) await shoot("w1-08", `顧問 /product/${planCode}`, { path: `/product/${encodeURIComponent(planCode)}`, role: "顧問", who: A });
  else console.log("⚠️ 找不到商品代號，/product/[planCode] 沒拍");

  // ── W2 客戶管理 ──
  await shoot("w2-01", "/clients 手動新增視窗（還沒勾同意）", { path: "/clients", role: "顧問", who: A, act: async page => {
    await clickText(/手動新增客戶/)(page);
    await page.locator("input:not([type=checkbox])").first().fill("截圖測試客戶").catch(() => {});
  } });
  await shoot("w2-01", "/clients 手動新增視窗（勾了已取得同意）", { path: "/clients", role: "顧問", who: A, act: async page => {
    await clickText(/手動新增客戶/)(page);
    await page.locator("input:not([type=checkbox])").first().fill("截圖測試客戶").catch(() => {});
    await page.locator("input[type=checkbox]").last().check();
  } });
  const manual = await api(A, "POST", "/api/advisor/clients", { name: "截圖測試客戶（手動）", phone: null, note: "驗收截圖用", consent: true });
  await shoot("w2-01", "/clients 清單（含手動新增的客戶）", { path: "/clients", role: "顧問", who: A, expect: /截圖測試客戶/ });
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), next = new Date(Date.now() + 8 * 3600e3 + 7 * 86400e3).toISOString().slice(0, 10);
  await api(A, "POST", `/api/advisor/clients/${C1.id}/crm`, { action: "interaction", kind: "call", day: today, summary: "驗收截圖：電話確認面談時間，客戶想先看醫療實支" });
  await api(A, "POST", `/api/advisor/clients/${C1.id}/crm`, { action: "follow_up", day: next, note: "驗收截圖：面談後一週追蹤" });
  await shoot("w2-02", "客戶頁互動紀錄、下次追蹤日", { path: `/clients/${C1.id}?tab=sum`, role: "顧問", who: A, expect: /驗收截圖/ });
  if (manual?.id ?? manual?.userId) await shoot("w2-02", "手動客戶的客戶頁", { path: `/clients/${manual.id ?? manual.userId}`, role: "顧問", who: A });
  await shoot("w2-03", "/todo 三組待辦", { path: "/todo", role: "顧問", who: A });
  await shoot("w2-03", "/todo ⋯ 選單展開", { path: "/todo", role: "顧問", who: A, act: async page => {
    const b = page.locator("button[data-menu]").first(); await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(600);
  } });
  if (db) {
    await shoot("w2-04", "客戶頁摘要「客戶打開過我的分析 N 次」", { path: `/clients/${C4.id}?tab=sum`, role: "顧問", who: A, expect: /打開/ });
    await shoot("w2-04", "客戶頁時間軸", { path: `/clients/${C4.id}?tab=time`, role: "顧問", who: A });
  }
  await shoot("w2-05", "/profile 回應速度", { path: "/profile", role: "顧問", who: A });
  reuse("w2-05", "w1-06", 1, "/advisors 卡片上的回應速度標籤（同 w1-06-1）");
  const mailHtml = path.join(os.tmpdir(), `radia-shots-mail-${process.pid}.html`);
  try {
    execFileSync("npx", ["tsx", "scripts/shots-mail.mts", mailHtml], { stdio: ["ignore", "ignore", "inherit"] });
    await shoot("w2-06", "存摺提醒信（本機產生的信件 HTML 預覽，開發版不寄信；內容為虛構範例）", { url: "file://" + mailHtml, path: "（信件預覽）", role: "客戶" });
  } catch (e) { console.log(`⚠️ 存摺提醒信預覽產生失敗：${e.message}`); }
  finally { fs.rmSync(mailHtml, { force: true }); }
  await shoot("w2-07", "諮詢紀錄分頁（浮水印）", { path: `/clients/${C1.id}?tab=chat&conv=${conv1}`, role: "顧問", who: A });
  await shoot("w2-07", "諮詢紀錄列印預覽（print 樣式）", { path: `/clients/${C1.id}?tab=chat&conv=${conv1}`, role: "顧問", who: A, print: true });

  // ── 管理後台 ──
  await shoot("w1b-03", "/welcome/advisor-apply 申請表", { path: "/welcome/advisor-apply", role: "客戶", who: C0 });
  await shoot("w1b-03", "/admin/advisors 申請區", { path: "/admin/advisors", role: "管理員", who: admin });
  await shoot("w1b-04", "/admin/monitor", { path: "/admin/monitor", role: "管理員", who: admin });
  reuse("w1b-05", "w1b-04", 1, "/admin/monitor（同 w1b-04-1）");
  await shoot("w1b-06", "/admin/content", { path: "/admin/content", role: "管理員", who: admin });
  await shoot("w1b-07", "/admin/audit", { path: "/admin/audit", role: "管理員", who: admin });

  // ── W3 文章 ──
  reuse("w3-01", "w1-09", 2, "/news（未登入，同 w1-09-1）");
  const slug = (await (await fetch(`${BASE}/news`)).text()).match(/href="\/news\/(?!preview)([^"?#]+)"/)?.[1];
  if (slug) await shoot("w3-02", "/news/[slug]（未登入）", { path: `/news/${slug}`, role: "未登入" });
  else console.log("⚠️ /news 沒有文章，/news/[slug] 沒拍");
  await shoot("w3-03", "/admin/news", { path: "/admin/news", role: "管理員", who: admin });

  // ── w1b-10 每日上限（暫時調低，拍完立刻還原） ──
  if (want("w1b-10")) {
    saved = (await api(admin, "GET", "/api/admin/monitor")).usage.thresholds;
    await api(admin, "PUT", "/api/admin/monitor", { ...saved, userDailyUsd: 0.000001 });
    const Ccap = await login("as=new-customer");
    let sc = await api(Ccap, "POST", "/api/consult", {});
    for (let i = 0; i < 6 && !sc.paused && sc.pending?.kind === "ask"; i++) {
      const opts = sc.pending.ask.options ?? []; let k = i === 0 ? opts.findIndex(o => /保單夠不夠/.test(o)) : opts.findIndex(o => !/直接約|去約顧問|現在去約/.test(o)); if (k < 0) k = 0;
      sc = await api(Ccap, "POST", "/api/consult/turn", { conversationId: sc.conversation.id, stepId: sc.pending.ask.stepId, option: k });
    }
    await shoot("w1b-10", `達到每日上限後的諮詢畫面（測試時暫時把上限調到 0.000001 美元，拍完已調回 ${saved.userDailyUsd}）`, { path: "/consult", role: "客戶", who: Ccap });
    await api(admin, "PUT", "/api/admin/monitor", saved);
    saved = null;
    // 調低上限時這位測試客戶會留下「被擋／超過上限」的警報，後台監控會出現假警報（10/15 #7），拍完清掉
    if (db) await db.query("delete from usage_alerts where user_id = $1", [Ccap.id]);
  }
  manifest.items["w1-10"] ??= [];
  manifest.items["w1b-08"] ??= [];
} catch (e) {
  console.error(`\n✗ 中斷：${e.message}`);
  process.exitCode = 1;
} finally {
  if (saved && admin) {
    const ok = await api(admin, "PUT", "/api/admin/monitor", saved).then(() => true, () => false);
    if (!ok) console.error(`\n⚠️⚠️ 每日上限沒有還原！請馬上到 /admin/monitor 改回 ${JSON.stringify(saved)}\n`);
  }
  if (db && madeBookings.length) {
    const r = await db.query("update bookings set status='cancelled_by_advisor', status_by=advisor_id, status_at=to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS') where status='booked' and id = any($1)", [madeBookings]);
    console.log(`\n取消這次建的測試預約 ${r.rowCount} 筆（共建 ${madeBookings.length} 筆，已面談的留著）`);
  } else if (madeBookings.length) console.log(`\n⚠️ 沒有 DEV_DB_URL，這次建的測試預約沒有取消：${madeBookings.join(", ")}`);
  await db?.end();
  await browser?.close();
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  const all = Object.values(manifest.items).flat().flatMap(x => Object.values(x.issues).flat());
  console.log(`\n拍了 ${shots} 張，manifest：${path.join(OUT, "manifest.json")}；自動檢查共 ${all.length} 個問題${failures.length ? `；拍攝失敗 ${failures.length} 張` : ""}`);
}
