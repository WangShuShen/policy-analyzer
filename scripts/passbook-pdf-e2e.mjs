#!/usr/bin/env node
/*
 * 上傳保險存摺 PDF 的自動測試（10/16 顧問實測：真存摺沒跳出密碼框、直接「打不開」）。
 * 用假的 AES-256 存摺（scripts/fixtures/fake-passbook-aes256.pdf，密碼 A123456789，內容全虛構；不准用真存摺），
 * 在真的瀏覽器裡走：選檔 → 跳出身分證字號框 → 打錯 → 「密碼不對」→ 打對 → 上傳成功（POST 200），
 * 並確認身分證字號沒有出現在送出去的內容裡。另外測：上傳失敗（網路斷）、不是 PDF，這兩種提示要跟「密碼不對」分開。
 * 再用中文假存摺（非內嵌字型）確認抽得出中文字。
 * 每種瀏覽器跑兩次：一般、模擬舊瀏覽器（拿掉 Promise.try、Map.getOrInsertComputed，相當於 iOS 18.2／Chrome 128 以前）。
 *
 * 用法（--base 一定要寫，沒有預設值，免得打錯打到別的地方）：
 *   AI_MOCK=1 npx next dev -p 3002
 *   node scripts/passbook-pdf-e2e.mjs --base http://localhost:3002 --pw <裝了 playwright(-core) 的資料夾> [--browsers chromium,webkit] [--chromium <執行檔>]
 *   開發版：--base https://radia-dev-woad.vercel.app（測試登入鑰匙讀 DEV_LOGIN_KEY 或 ~/.config/radia/dev-login.env；會用一位新測試客戶真的上傳一次假存摺）
 *   上線版一律拒絕。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base")?.replace(/\/$/, "");
if (!BASE) { console.error("要指定 --base（例：http://localhost:3002）"); process.exit(2); }
if (/policy-analyzer|radia\.tw/.test(BASE)) { console.error("上線版不測"); process.exit(2); }
const PW = arg("pw", process.env.PLAYWRIGHT_DIR);
const BROWSERS = arg("browsers", "chromium,webkit").split(",");
const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures/fake-passbook-aes256.pdf");
const CJK = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures/fake-passbook-cjk.pdf");   // 中文、非內嵌字型
const ID = "A123456789";

let pw;
const req = createRequire(PW ? path.join(path.resolve(PW), "x.js") : import.meta.url);
try { pw = req("playwright"); } catch { try { pw = req("playwright-core"); } catch { console.error("找不到 playwright：在暫存資料夾 npm i playwright-core，再用 --pw <那個資料夾>"); process.exit(2); } }

const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
let KEY = process.env.DEV_LOGIN_KEY ?? "";
const keyFile = path.join(os.homedir(), ".config/radia/dev-login.env");
if (!KEY && !LOCAL && fs.existsSync(keyFile)) KEY = /^DEV_LOGIN_KEY=(.+)$/m.exec(fs.readFileSync(keyFile, "utf8"))?.[1]?.trim() ?? "";
async function login() {
  const r = await fetch(`${BASE}/api/dev-login?as=new-customer${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
  const c = (r.headers.getSetCookie?.() ?? []).find(x => x.startsWith("auth_token="));
  if (!c) throw new Error(`測試登入失敗 HTTP ${r.status}`);
  return c.split(";")[0].slice("auth_token=".length);
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}`); };
const PWBOX = 'input[aria-label="身分證字號"]';
const errOf = pg => pg.evaluate(() => document.querySelector(".upload .rd-err")?.textContent ?? "");
const waitErr = async (pg, re, ms = 20_000) => { const t = Date.now(); let e = ""; while (Date.now() - t < ms) { e = await errOf(pg); if (re.test(e)) return e; await pg.waitForTimeout(250); } return e; };

for (const name of BROWSERS) {
  const type = pw[name]; if (!type) { console.log(`（沒有 ${name}，跳過）`); continue; }
  const exe = name === "chromium" ? arg("chromium") : undefined;
  let browser;
  try { browser = await type.launch(exe ? { executablePath: exe } : {}); }
  catch (e) { console.log(`（${name} 開不起來，跳過：${String(e.message).split("\n")[0]}）`); continue; }
  for (const old of [false, true]) {
    const tag = `${name}${old ? "（模擬舊瀏覽器）" : ""}`;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "auth_token", value: await login(), url: BASE }]);
    if (old) await ctx.addInitScript(() => { delete Promise.try; delete Map.prototype.getOrInsertComputed; });
    const pg = await ctx.newPage();
    const errors = []; pg.on("pageerror", e => errors.push(e.message));
    const bodies = []; pg.on("request", q => { if (q.method() === "POST" && /\/api\/passbook$/.test(new URL(q.url()).pathname)) bodies.push(q.postData() ?? ""); });
    await pg.goto(`${BASE}/analysis#upload`, { waitUntil: "networkidle", timeout: 90_000 });
    const file = pg.locator(".upload input[type=file]").first();

    // 0. 不是 PDF（副檔名 .pdf 但內容是文字）→ 「不是 PDF」，不能講成瀏覽器或密碼的問題
    if (!old) {
      await file.setInputFiles({ name: "not-a-pdf.pdf", mimeType: "application/pdf", buffer: Buffer.from("hello, this is not a pdf") });
      const inv = await waitErr(pg, /不是 PDF|打不開|讀不出|瀏覽器/);
      ok(/不是 PDF/.test(inv), `${tag}：不是 PDF → 「不是 PDF」（${inv.slice(0, 40)}）`);
    }

    // 1. 選加密 PDF → 一定要跳出身分證字號框
    await file.setInputFiles(FIXTURE);
    const asked = await pg.locator(PWBOX).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    ok(asked, `${tag}：選了加密 PDF → 跳出身分證字號框${asked ? "" : `（畫面：${await errOf(pg) || "沒有提示"}；${errors[0] ?? ""}）`}`);
    if (!asked) { await ctx.close(); continue; }

    // 2. 打錯 → 「密碼不對」，框還在
    await pg.fill(PWBOX, "A000000000"); await pg.locator(PWBOX).press("Enter");
    const wrong = await waitErr(pg, /密碼不對/);
    ok(/密碼不對/.test(wrong) && await pg.locator(PWBOX).isVisible(), `${tag}：打錯 → 「密碼不對」，可以再打`);

    // 3. 上傳失敗（網路斷）→ 要講「沒傳上去」，不是「打不開」
    if (!old) {
      await pg.route("**/api/passbook", r => r.request().method() === "POST" ? r.abort("internetdisconnected") : r.continue());
      await pg.fill(PWBOX, ID); await pg.locator(PWBOX).press("Enter");
      const net = await waitErr(pg, /沒傳上去|打不開|讀不出/);
      ok(/沒傳上去/.test(net) && !/打不開/.test(net), `${tag}：上傳時網路斷 → 「沒傳上去」（${net.slice(0, 40)}）`);
      await pg.unroute("**/api/passbook");
      ok(await pg.locator(PWBOX).isVisible(), `${tag}：沒傳上去之後，再打一次身分證字號就能重送（不用重選檔案）`);
    }

    // 4. 打對 → 上傳成功（POST 200）；身分證字號不在送出的內容裡
    const resp = pg.waitForResponse(r => r.request().method() === "POST" && /\/api\/passbook$/.test(new URL(r.url()).pathname), { timeout: 60_000 }).catch(() => null);
    await pg.fill(PWBOX, ID); await pg.locator(PWBOX).press("Enter");
    const r = await resp;
    ok(r?.status() === 200, `${tag}：打對 → 上傳成功（HTTP ${r?.status() ?? "沒送出"}）`);
    const last = bodies.at(-1) ?? "";
    ok(last.includes("Demo Term Life") && !last.includes(ID), `${tag}：送出的是解開後的保單文字，沒有身分證字號`);
    // 回應到了畫面還要一下才更新（開發版比本機慢）→ 等最多 5 秒
    const closed = await pg.locator(PWBOX).waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    ok(closed, `${tag}：上傳後密碼框收起來`);

    // 6. 中文假存摺（沒內嵌的 MSung-Light＋UniCNS-UCS2-H，台灣 PDF 常見）→ 要抽得出中文字（靠 cMapUrl），不能退成空白圖片
    if (!old) {
      const ctx2 = await browser.newContext(); await ctx2.addCookies([{ name: "auth_token", value: await login(), url: BASE }]);
      const p2 = await ctx2.newPage(); let body2 = "";
      p2.on("request", q => { if (q.method() === "POST" && /\/api\/passbook$/.test(new URL(q.url()).pathname)) body2 = q.postData() ?? ""; });
      await p2.goto(`${BASE}/analysis#upload`, { waitUntil: "networkidle", timeout: 90_000 });
      await p2.locator(".upload input[type=file]").first().setInputFiles(CJK);
      await p2.locator(PWBOX).waitFor({ timeout: 20_000 }).catch(() => {});
      const done = p2.waitForResponse(r => r.request().method() === "POST" && /\/api\/passbook$/.test(new URL(r.url()).pathname), { timeout: 60_000 }).catch(() => null);
      await p2.fill(PWBOX, ID).catch(() => {}); await p2.locator(PWBOX).press("Enter").catch(() => {});
      const r2 = await done; let kind = "", text = "";
      try { const c = JSON.parse(body2).content; kind = c.kind; text = (c.pages ?? []).join("\n"); } catch { /* 沒送出 */ }
      ok(r2?.status() === 200 && kind === "text" && text.includes("示範定期壽險"), `${tag}：中文存摺 → 抽出中文字上傳（${kind || "沒送出"}）`);
      await ctx2.close();
    }
    ok(!errors.length, `${tag}：沒有未處理的頁面錯誤${errors.length ? `（${errors[0].slice(0, 80)}）` : ""}`);
    await ctx.close();
  }
  await browser.close();
}
console.log(`\n${pass} 過 / ${fail} 不過`);
process.exit(fail ? 1 : 0);
