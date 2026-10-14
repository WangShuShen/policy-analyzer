#!/usr/bin/env node
/*
 * AI 諮詢情境回歸測試（100_Todo/projects/RADIA-v2-諮詢測試情境.md 的 T01–T16，加 T17–T18 財務子路線）。
 * 用真的 AI 跑：每條開一個新的測試客戶（/api/dev-login?as=new-customer），照劇本點選項／打字，
 * 自動檢查「不能出現」欄；「應該怎麼接」要人看，所以每輪的完整對話另存成 JSON。
 * T14（選項夾帶金額）沒辦法從畫面逼 AI 產生，改由 compliance 單元測試涵蓋。
 *
 * 用法：
 *   node scripts/consult-scenarios.mjs                       # 全部，每條 3 輪（AI 每次講法不同，三次都要過）
 *   node scripts/consult-scenarios.mjs --rounds 1 --only T01,T07
 *   node scripts/consult-scenarios.mjs --base http://localhost:3002 --out /tmp/radia-scenarios
 *   node scripts/consult-scenarios.mjs --mock                 # 伺服器開著 AI_MOCK=1：只驗程式流程，要靠 AI 理解力的情境標「需真 AI 補驗」
 *   node scripts/consult-scenarios.mjs --base https://radia-dev-woad.vercel.app --key <DEV_LOGIN_KEY>   # 對開發版跑（或 node --env-file=.env.local … 不帶 --key，從 DEV_LOGIN_KEY 讀）
 * 前提：本機 dev server 已開，且 .env.local 有 DEV_LOGIN=1（測試登入只認 localhost）。
 * 每改一次 AI 指令或合規層都要全部重跑。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3002");
const ROUNDS = Number(arg("rounds", "3"));
const OUT = arg("out", path.join(os.tmpdir(), "radia-consult-scenarios"));
const CONC = Number(arg("concurrency", "6"));
const MOCK = process.argv.includes("--mock");
// 金鑰優先從環境變數讀（node --env-file=.env.local …），避免留在 shell 歷史
const KEY = arg("key", /localhost|127\.0\.0\.1/.test(BASE) ? "" : process.env.DEV_LOGIN_KEY ?? "");
fs.mkdirSync(OUT, { recursive: true });

// 劇本：{opt:"選項文字片段"} 點選項｜{text:"..."} 打字｜{any:true} 點第一個選項
// facts：最後右欄該記成什麼｜expect：[第幾步, 那一步的 AI 回覆要符合]
// bad 只比對 AI 回覆本文（不含選項）：「老了要人照顧」這種擔心選項是正常的，10/12 的 bug 是追問照顧費
const TOOL_WORDS = /投資型|變額|利變|利率變動|儲蓄險|儲蓄型|月配息|類全委|萬能/;
const S = {
  T01: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我只想問我自己的個人保險" }, { text: "我可以預約顧問嗎" }],
    bad: [/醫生|持續多久|照顧(費|的錢)/] },
  T02: { steps: [{ text: "我媽上個月中風" }, { opt: "都是我在出" }, { text: "醫生說不知道要多久" }], bad: [] },
  T03: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { any: true }], bad: [/照顧(費|的錢)|看護/] },
  T04: { realAI: true, steps: [{ text: "最近看到一個 30 幾歲的人中風，有點怕" }], bad: [/你(上次|之前)?中風/],
    facts: { trigger: /新聞/ } },
  T05: { steps: [{ text: "我要直接約顧問" }, { opt: "先不說" }], bad: [] },
  T06: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { text: "實支實付是什麼？" }], bad: [/下一題|回到剛剛/, /人壽|產險/] },
  T07: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "你推薦哪一張？哪家比較好？" }], bad: [/人壽|產險|比較好的是|推薦你/] },
  T08: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我應該保多少才夠？" }], bad: [/\d[\d,，.]*\s*(萬|元)|倍/] },
  T09: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { text: "老婆跟一個小孩" }, { text: "這個不想講" }], bad: [/收入/],
    lastOnly: true },
  T10: { realAI: true, steps: [{ text: "我爸上週剛走，我現在很亂" }], bad: [/[？?]/], lastOnly: true },
  T11: { realAI: true, steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我一個人養兩個小孩，最怕我倒下他們沒人管" }], bad: [] },
  T12: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "沒什麼特別原因" }, { text: "我沒有保單" }, { any: true }, { text: "啊其實公司有團保" }], bad: [],
    facts: { existing_policy: /團保|有/ } },
  T13: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "老婆跟一個小孩靠我" }, { text: "最怕生病沒收入" }, { text: "有幾張，不太清楚內容" }], bad: [/照顧費/] },
  T15: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { any: true }, { any: true }, { any: true }], bad: [] },
  // 上傳存摺 → 確認清單 → 送出「上傳好了」→ 走到「該補什麼」→ 約顧問 → 顧問端看得到案例區塊（A3b）
  // 模擬模式下存摺讀取回固定的示範保單（lib/passbook/read.ts）；真 AI 模式要真的檔案，所以只在 --mock 跑
  T20: { mockOnly: true, steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "朋友" }, { opt: "另一半" }, { opt: "差不多" }, { any: true }, { any: true },
    { any: true }, { any: true }, { upload: true }], bad: [], panels: ["gaps"], advisorSees: "為什麼要補？看數據",
    customerSees: [/對著條款跟你說才準/], customerNot: [/這是規定/] },
  // N7：每人每天 AI 用量上限。暫時把上限調到 0.000001 美元（模擬模式每次呼叫記 1 微美元），測完一定還原。
  // 改的是全站設定，所以 T21 等其他情境都跑完才一輪一輪單獨跑（exclusive）
  T21: { mockOnly: true, exclusive: true, run: runCap },
  // 4-ap：面談前客戶端不出現工具類型（投資型、變額……），只講路線；顧問端照樣看得到完整配置
  T22: { steps: [{ opt: "想算算未來需要準備多少錢" }, { opt: "說不上來" }, { opt: "30 幾" }, { opt: "願意承受波動" }], bad: [TOOL_WORDS],
    panels: ["route"], customerSees: [/建議路線/], customerNot: [TOOL_WORDS], snapNot: TOOL_WORDS, advisorFin: TOOL_WORDS },
  // 一路點選項走到底：收入題點「兩個人差不多」要記得住、不能重問（10/14 卡 A 回報連點 25 次都重問）
  T19: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "朋友" }, { opt: "另一半" }, { opt: "差不多" }, { any: true }, { any: true }], bad: [],
    facts: { income_share: /差不多|雙薪/, worry: /./, existing_policy: /./ } },
  // 財務版「最擔心」直接決定子路線，之後不再問「從哪一塊開始看」（4-ai，顧問 10/13 定案）
  T16: { steps: [{ opt: "想算算未來需要準備多少錢" }, { opt: "退休" }, { any: true }, { any: true }], bad: [/照顧|看護|中風/, /哪一塊/],
    expect: [[0, /擔心/], [3, /每個月/]] },
  // 答「說不上來」→ 才退回問「從哪一塊開始看」
  T17: { steps: [{ opt: "想算算未來需要準備多少錢" }, { opt: "說不上來" }, { any: true }, { any: true }], bad: [],
    expect: [[3, /哪一塊/]] },
  // 打字回答「最擔心」也要判斷出子路線
  T18: { realAI: true, steps: [{ opt: "想算算未來需要準備多少錢" }, { text: "我最怕退休後錢不夠用" }, { any: true }, { any: true }], bad: [/哪一塊/],
    expect: [[3, /每個月/]] },
};
// realAI：要靠 AI 的語意理解（新聞 vs 家人、情緒、一句話填多點、打字判子路線）。--mock 時一律標「需真 AI 補驗」：
// 模擬的關鍵字規則剛好抓得到，不代表真 AI 沒問題；沒過也不算失敗
// 每條都不能出現：AI 自言自語、念出內部指令、markdown（4-ai）
const COMMON_BAD = [/不行，|不能說|這樣講就好|下一題|這一輪|最後問|撰寫考量|```|\*\*/];

const strip = h => String(h ?? "").replace(/<[^>]+>/g, "");

async function runOne(id, round) {
  const sc = S[id];
  if (sc.run) return sc.run(id, round);
  const login = await fetch(`${BASE}/api/dev-login?as=new-customer${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`測試登入失敗（HTTP ${login.status}）：確認 dev server 開著、DEV_LOGIN=1`);
  const H = { cookie, "content-type": "application/json" };
  let snap = await (await fetch(`${BASE}/api/consult`, { method: "POST", headers: H, body: "{}" })).json();
  const log = [], ms = [], replies = [];
  let seen = snap.messages.length, broken = null;
  for (const m of snap.messages) log.push(`AI: ${strip(m.content.html ?? m.content.text)}`);
  for (const step of sc.steps) {
    const p = snap.pending;
    if (step.upload) {
      if (p?.kind !== "upload") { broken = `走不到上傳存摺那一步（pending=${p?.kind}）`; break; }
      log.push("(上傳存摺)");
      const up = await fetch(`${BASE}/api/passbook`, { method: "POST", headers: H,
        body: JSON.stringify({ conversationId: snap.conversation.id, content: { kind: "text", pages: ["情境測試用存摺：模擬模式下內容不會被讀，讀取會回固定的示範保單。上傳端要求至少 30 個字。"] } }) });
      if (!up.ok) { broken = `上傳失敗 HTTP ${up.status}`; break; }
      const waitFor = async (want) => {
        for (let i = 0; i < 60; i++) {
          const v = await (await fetch(`${BASE}/api/passbook`, { headers: H })).json();
          if (v.upload?.status === want) return v;
          if (v.upload?.status === "failed") throw new Error(`存摺讀取失敗：${v.upload.error}`);
          await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error(`等不到存摺狀態 ${want}`);
      };
      try {
        const v = await waitFor("confirming");
        log.push(`(確認清單 ${v.policies.length} 張)`);
        const c = await fetch(`${BASE}/api/passbook/confirm`, { method: "POST", headers: H,
          body: JSON.stringify({ uploadId: v.upload.id, items: v.policies.map(x => ({ id: x.id, keep: true })) }) });
        if (!c.ok) { broken = `確認清單失敗 HTTP ${c.status}`; break; }
        await waitFor("done");
      } catch (e) { broken = String(e.message ?? e); break; }
      const r = await fetch(`${BASE}/api/consult/turn`, { method: "POST", headers: H,
        body: JSON.stringify({ conversationId: snap.conversation.id, stepId: p.uploadStepId, uploaded: true }) });
      const j = await r.json();
      if (!r.ok) { broken = `送出「上傳好了」HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`; break; }
      snap = j;
      const turn = [];
      for (const m of snap.messages.slice(seen)) if (m.role === "assistant") {
        const text = strip(m.content.html ?? m.content.text ?? (m.content.kind === "panel" ? `［右欄：${m.content.key}］` : ""));
        turn.push({ text, chips: m.content.chips ?? [] });
        log.push(`AI: ${text}`);
      }
      replies.push(turn);
      seen = snap.messages.length;
      continue;
    }
    const opts = p?.ask?.options ?? [];
    let body;
    if (step.text) { body = { text: step.text }; log.push(`客戶: ${step.text}`); }
    else {
      const i = step.any ? 0 : opts.findIndex(o => o.includes(step.opt));
      if (i < 0) { broken = `找不到選項「${step.opt}」，畫面上是：${opts.join("／") || "（沒有選項）"}`; break; }
      body = { option: i }; log.push(`(點) ${opts[i]}`);
    }
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/consult/turn`, { method: "POST", headers: H,
      body: JSON.stringify({ conversationId: snap.conversation.id, stepId: p?.ask?.stepId, ...body }) });
    ms.push(Date.now() - t0);
    const j = await r.json();
    if (!r.ok) { broken = `HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`; break; }
    snap = j;
    const turn = [];
    for (const m of snap.messages.slice(seen)) if (m.role === "assistant") {
      const text = strip(m.content.html ?? m.content.text);
      turn.push({ text, chips: m.content.chips ?? [] });
      log.push(`AI: ${text}${m.content.chips?.length ? `  [選項] ${m.content.chips.join("／")}` : ""}`);
    }
    replies.push(turn);
    seen = snap.messages.length;
  }
  const facts = Object.fromEntries(snap.facts.map(f => [f.key, f.display]));
  const shownPanels = snap.messages.flatMap(m => m.content.kind === "panel" ? [m.content.key] : []);
  // 客戶端整個畫面資料（對話＋右欄）不能出現的字
  const snapFail = sc.snapNot && !broken && sc.snapNot.test(JSON.stringify({ m: snap.messages, a: snap.analysis }))
    ? `客戶端畫面資料出現 ${sc.snapNot}（${JSON.stringify({ m: snap.messages, a: snap.analysis }).match(sc.snapNot)[0]}）` : null;
  // 顧問端「財務規劃」分頁：配置邏輯照算，工具類型要看得到（4-ad；客戶端只是不顯示）
  let finFail = null;
  if (sc.advisorFin && !broken) {
    try {
      const userId = JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[1], "base64url").toString()).advisorId;
      const advisorId = arg("advisor", "dev-adv-b");
      const free = (await (await fetch(`${BASE}/api/advisors/${advisorId}/slots`, { headers: H })).json()).slots ?? [];
      const startsAt = free[Math.floor(Math.random() * Math.min(free.length, 40))]?.startsAt;
      if (!startsAt) throw new Error("這位顧問沒有可約的時段");
      const b = await fetch(`${BASE}/api/bookings`, { method: "POST", headers: H, body: JSON.stringify({ advisorId, startsAt, mode: "online" }) });
      if (!b.ok) throw new Error(`約顧問失敗 HTTP ${b.status}`);
      const ac = await devLogin("advisor", advisorId);
      const html = await (await fetch(`${BASE}/clients/${userId}?tab=fin&conv=${snap.conversation.id}`, { headers: { cookie: ac } })).text();
      const hit = html.match(sc.advisorFin);
      log.push(`顧問端財務規劃：${hit ? `看得到「${hit[0]}」` : "看不到工具類型"}`);
      if (!hit) finFail = "顧問端財務規劃看不到工具類型（配置不該被拿掉）";
    } catch (e) { finFail = String(e.message ?? e); }
  }
  // 客戶端「我的分析」：面談前鎖住的區塊，解鎖卡的說法（顧問 10/14：不說「這是規定」）
  let customerFail = null;
  if ((sc.customerSees || sc.customerNot) && !broken) {
    const html = await (await fetch(`${BASE}/analysis`, { headers: { cookie } })).text();
    const miss = (sc.customerSees ?? []).filter(re => !re.test(html)).map(re => `客戶端我的分析看不到 ${re}`);
    const hit = (sc.customerNot ?? []).filter(re => re.test(html)).map(re => `客戶端我的分析出現 ${re}`);
    log.push(`客戶端我的分析：${miss.length + hit.length ? "不符" : "符合"}`);
    if (miss.length + hit.length) customerFail = [...miss, ...hit].join("；");
  }
  // 顧問端：客戶約了顧問之後，顧問的客戶頁「保障分析」要看得到案例區塊
  let advisorFail = null;
  if (sc.advisorSees && !broken) {
    try {
      const userId = JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[1], "base64url").toString()).advisorId;
      const advisorId = arg("advisor", "dev-adv-b");
      const slots = await (await fetch(`${BASE}/api/advisors/${advisorId}/slots`, { headers: H })).json();
      // 同時跑好幾輪會搶同一個時段，隨機挑一個
      const free = slots.slots ?? [];
      const startsAt = free[Math.floor(Math.random() * Math.min(free.length, 40))]?.startsAt;
      if (!startsAt) throw new Error("這位顧問沒有可約的時段");
      const b = await fetch(`${BASE}/api/bookings`, { method: "POST", headers: H, body: JSON.stringify({ advisorId, startsAt, mode: "online" }) });
      if (!b.ok) throw new Error(`約顧問失敗 HTTP ${b.status} ${(await b.text()).slice(0, 150)}`);
      const al = await fetch(`${BASE}/api/dev-login?as=advisor&id=${advisorId}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
      const ac = al.headers.get("set-cookie")?.split(";")[0];
      const html = await (await fetch(`${BASE}/clients/${userId}?tab=gap`, { headers: { cookie: ac } })).text();
      const n = html.split(sc.advisorSees).length - 1;
      log.push(`顧問端客戶頁：「${sc.advisorSees}」出現 ${n} 處`);
      if (n === 0) advisorFail = `顧問端客戶頁看不到「${sc.advisorSees}」`;
    } catch (e) { advisorFail = String(e.message ?? e); }
  }
  log.push(`右欄：${snap.facts.map(f => `${f.label ?? f.key}=${f.display}`).join("｜")}`);

  const checked = sc.lastOnly ? replies.slice(-1) : replies;
  const replyText = checked.flat().map(x => x.text).join("\n");
  const allText = replies.flat().map(x => `${x.text}\n${x.chips.join("\n")}`).join("\n");
  const fails = [
    ...(broken ? [broken] : []),
    ...sc.bad.filter(re => re.test(replyText)).map(re => `出現 ${re}`),
    ...COMMON_BAD.filter(re => re.test(allText)).map(re => `出現 ${re}`),
    ...(sc.expect ?? []).filter(([i, re]) => !re.test((replies[i] ?? []).map(x => x.text).join("\n"))).map(([i, re]) => `第 ${i + 1} 步的回覆應符合 ${re}`),
    ...(sc.panels ?? []).filter(k => !shownPanels.includes(k)).map(k => `右欄沒有出現 ${k}`),
    ...(customerFail ? [customerFail] : []),
    ...(snapFail ? [snapFail] : []),
    ...(finFail ? [finFail] : []),
    ...(advisorFail ? [advisorFail] : []),
    ...Object.entries(sc.facts ?? {}).filter(([k, re]) => !re.test(facts[k] ?? "")).map(([k, re]) => `右欄 ${k}=${facts[k] ?? "（沒記）"}，應符合 ${re}`),
  ];
  const deferred = MOCK && !!sc.realAI;
  const out = { id, round, ok: fails.length === 0 || deferred, deferred, fails, ms, log };
  fs.writeFileSync(path.join(OUT, `${id}-${round}.json`), JSON.stringify(out, null, 1));
  return out;
}

async function devLogin(as, id) {
  const r = await fetch(`${BASE}/api/dev-login?as=${as}${id ? `&id=${id}` : ""}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
  const c = r.headers.get("set-cookie")?.split(";")[0];
  if (!c) throw new Error(`測試登入失敗（${as}，HTTP ${r.status}）`);
  return c;
}

async function runCap(id, round) {
  const log = [], fails = [], ms = [];
  const admin = { cookie: await devLogin("admin", arg("advisor", "dev-adv-b")), "content-type": "application/json" };
  const getUsage = async () => (await (await fetch(`${BASE}/api/admin/monitor`, { headers: admin })).json()).usage;
  const putTh = (t) => fetch(`${BASE}/api/admin/monitor`, { method: "PUT", headers: admin, body: JSON.stringify(t) });
  const saved = (await getUsage()).thresholds;
  const H = { cookie: await devLogin("new-customer"), "content-type": "application/json" };
  let snap = await (await fetch(`${BASE}/api/consult`, { method: "POST", headers: H, body: "{}" })).json();
  const turn = async (body) => {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/consult/turn`, { method: "POST", headers: H, body: JSON.stringify({ conversationId: snap.conversation.id, stepId: snap.pending?.ask?.stepId, ...body }) });
    ms.push(Date.now() - t0);
    const j = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 150)}`);
    return j;
  };
  try {
    if (!(await putTh({ ...saved, userDailyUsd: 0.000001 })).ok) throw new Error("調低上限失敗");
    log.push(`上限暫時調成 0.000001（原本 ${saved.userDailyUsd}）`);
    if (snap.paused) fails.push("還沒用 AI 就被暫停了");
    // 照常聊，直到被暫停（模擬模式每次呼叫 1 微美元，兩三輪內就會超過）
    for (let i = 0; i < 6 && !snap.paused; i++) {
      const opts = snap.pending?.ask?.options ?? [];
      if (snap.pending?.kind !== "ask" || !opts.length) { fails.push(`還沒被暫停就走不下去（pending=${snap.pending?.kind}）`); break; }
      const pick = i === 0 ? Math.max(0, opts.findIndex(o => o.includes("想看看我的保單夠不夠"))) : Math.max(0, opts.findIndex(o => !/直接約|去約顧問|現在去約/.test(o)));
      log.push(`使用者：${opts[pick]}`);
      snap = await turn({ option: pick });
    }
    if (!snap.paused) fails.push("聊了 6 輪都沒有被暫停");
    else {
      log.push(`第 ${ms.length} 輪後暫停`);
      const before = { msgs: snap.messages.length, facts: snap.facts.length };
      // 暫停後打字、點選項：伺服器什麼都不收、不呼叫 AI，回原本的畫面
      const t = await turn({ text: "我還想再問一下" });
      if (!t.paused) fails.push("暫停後打字，回應沒有標 paused");
      if (t.messages.length !== before.msgs) fails.push(`暫停後打字，訊息從 ${before.msgs} 變成 ${t.messages.length}（不該收、不該回）`);
      if (t.facts.length !== before.facts) fails.push(`暫停後右欄從 ${before.facts} 項變成 ${t.facts.length} 項（講過的要留著）`);
      const o = await turn({ option: 0 });
      if (o.messages.length !== before.msgs) fails.push("暫停後點選項，對話還是往下走了");
      // 重新打開：還是暫停、講過的都在
      const re = await (await fetch(`${BASE}/api/consult?id=${snap.conversation.id}`, { headers: H })).json();
      if (!re.paused) fails.push("重新打開對話，沒有維持暫停");
      if (re.facts.length !== before.facts) fails.push("重新打開對話，右欄少了東西");
      // 衛教也停，而且話要軟：不提上限、費用
      const e = await fetch(`${BASE}/api/consult/edu`, { method: "POST", headers: H, body: JSON.stringify({ text: "實支實付是什麼？" }) });
      const ej = await e.json();
      if (e.status !== 429 || ej.code !== "paused") fails.push(`衛教沒有暫停（HTTP ${e.status}）`);
      if (!/今天先聊到這裡/.test(ej.error ?? "")) fails.push(`暫停的話不對：${ej.error}`);
      if (/上限|費用|額度|美元/.test(ej.error ?? "")) fails.push(`暫停的話提到上限或費用：${ej.error}`);
      log.push(`暫停的話：${ej.error}`);
    }
  } catch (e) { fails.push(String(e.message ?? e)); }
  finally {
    const r = await putTh(saved);
    const now = r.ok ? (await getUsage()).thresholds : null;
    if (!now || now.userDailyUsd !== saved.userDailyUsd || now.monthlyBudgetUsd !== saved.monthlyBudgetUsd) {
      console.error(`\n⚠️⚠️ T21 沒有把上限還原！請馬上到 /admin/monitor 改回 ${JSON.stringify(saved)}\n`);
      fails.push("上限沒有還原");
    } else log.push(`上限已還原成 ${saved.userDailyUsd}`);
  }
  // 後台：今天被暫停的人數要算到他（還原後才看，看的時候會順便跑一次全站警報檢查）
  if (snap.paused) {
    const u = await getUsage();
    if (!(u.blockedToday >= 1)) fails.push(`後台「今天被暫停」是 ${u.blockedToday}`);
    log.push(`後台今天被暫停 ${u.blockedToday} 人`);
  }
  const out = { id, round, ok: fails.length === 0, deferred: false, fails, ms, log };
  fs.writeFileSync(path.join(OUT, `${id}-${round}.json`), JSON.stringify(out, null, 1));
  return out;
}

// --mock：先確認伺服器真的在模擬模式（諮詢頁上方有「AI 為模擬回覆」），不然等於拿真 AI 在跑
if (MOCK) {
  const l = await fetch(`${BASE}/api/dev-login?as=new-customer${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
  const html = await (await fetch(`${BASE}/consult`, { headers: { cookie: l.headers.get("set-cookie")?.split(";")[0] ?? "" } })).text();
  if (!html.includes("AI 為模擬回覆")) { console.error("--mock：伺服器沒有開模擬模式（AI_MOCK=1、RADIA_ENV=dev、APP_URL 是本機或開發版）"); process.exit(2); }
}
const ids = arg("only")?.split(",") ?? Object.keys(S).filter(id => MOCK || !S[id].mockOnly);
for (const id of ids) if (!S[id]) { console.error(`沒有情境 ${id}`); process.exit(2); }
const jobsOf = (pred) => ids.filter(pred).flatMap(id => Array.from({ length: ROUNDS }, (_, r) => [id, r + 1]));
const jobs = jobsOf(id => !S[id].exclusive);
const results = [];
const runJob = async ([id, r]) => {
  try { results.push(await runOne(id, r)); }
  catch (e) { results.push({ id, round: r, ok: false, fails: [String(e)], ms: [] }); }
};
await Promise.all(Array.from({ length: CONC }, async () => { while (jobs.length) await runJob(jobs.shift()); }));
// 會改全站設定的情境，等其他都跑完再一輪一輪單獨跑
for (const j of jobsOf(id => S[id].exclusive)) await runJob(j);

const allMs = results.flatMap(r => r.ms);
let failed = 0;
for (const id of ids) {
  const rs = results.filter(r => r.id === id).sort((a, b) => a.round - b.round);
  const pass = rs.filter(r => r.ok).length;
  if (pass < rs.length) failed++;
  const deferred = rs.filter(r => r.deferred).length;
  const raw = rs.filter(r => r.fails.length === 0).length;
  console.log(deferred ? `△ ${id}  需真 AI 補驗（模擬下流程 ${raw}/${rs.length} 輪通過）` : `${pass < rs.length ? "✗" : "✓"} ${id}  ${pass}/${rs.length} 輪通過`);
  for (const r of rs) for (const f of r.fails) console.log(`    #${r.round} ${f}`);
}
const nDeferred = MOCK ? ids.filter(id => S[id].realAI).length : 0;
console.log(`\n${MOCK ? `【模擬模式】${nDeferred} 條標 △，要等有真 AI 再補驗\n` : ""}${ids.length - failed}/${ids.length} 條全過｜每輪平均 ${(allMs.reduce((a, b) => a + b, 0) / Math.max(allMs.length, 1) / 1000).toFixed(1)} 秒｜「應該怎麼接」請看 ${OUT}/*.json`);
process.exit(failed ? 1 : 0);
