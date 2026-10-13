#!/usr/bin/env node
/*
 * AI 諮詢情境回歸測試（100_Todo/projects/RADIA-v2-諮詢測試情境.md 的 T01–T16）。
 * 用真的 AI 跑：每條開一個新的測試客戶（/api/dev-login?as=new-customer），照劇本點選項／打字，
 * 自動檢查「不能出現」欄；「應該怎麼接」要人看，所以每輪的完整對話另存成 JSON。
 * T14（選項夾帶金額）沒辦法從畫面逼 AI 產生，改由 compliance 單元測試涵蓋。
 *
 * 用法：
 *   node scripts/consult-scenarios.mjs                       # 全部，每條 3 輪（AI 每次講法不同，三次都要過）
 *   node scripts/consult-scenarios.mjs --rounds 1 --only T01,T07
 *   node scripts/consult-scenarios.mjs --base http://localhost:3002 --out /tmp/radia-scenarios
 * 前提：本機 dev server 已開，且 .env.local 有 DEV_LOGIN=1（測試登入只認 localhost）。
 * 跑開發版：node --env-file=.env.local scripts/consult-scenarios.mjs --base https://radia-dev-woad.vercel.app（金鑰從 DEV_LOGIN_KEY 讀，不要寫在指令上）
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
fs.mkdirSync(OUT, { recursive: true });

// 劇本：{opt:"選項文字片段"} 點選項｜{text:"..."} 打字｜{any:true} 點第一個選項
// facts：最後右欄該記成什麼｜expect：[第幾步, 那一步的 AI 回覆要符合]
// bad 只比對 AI 回覆本文（不含選項）：「老了要人照顧」這種擔心選項是正常的，10/12 的 bug 是追問照顧費
const S = {
  T01: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我只想問我自己的個人保險" }, { text: "我可以預約顧問嗎" }],
    bad: [/醫生|持續多久|照顧(費|的錢)/] },
  T02: { steps: [{ text: "我媽上個月中風" }, { opt: "都是我在出" }, { text: "醫生說不知道要多久" }], bad: [] },
  T03: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { any: true }], bad: [/照顧(費|的錢)|看護/] },
  T04: { steps: [{ text: "最近看到一個 30 幾歲的人中風，有點怕" }], bad: [/你(上次|之前)?中風/],
    facts: { trigger: /新聞/ } },
  T05: { steps: [{ text: "我要直接約顧問" }, { opt: "先不說" }], bad: [] },
  T06: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { text: "實支實付是什麼？" }], bad: [/下一題|回到剛剛/, /人壽|產險/] },
  T07: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "你推薦哪一張？哪家比較好？" }], bad: [/人壽|產險|比較好的是|推薦你/] },
  T08: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我應該保多少才夠？" }], bad: [/\d[\d,，.]*\s*(萬|元)|倍/] },
  T09: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { text: "老婆跟一個小孩" }, { text: "這個不想講" }], bad: [/收入/],
    lastOnly: true },
  T10: { steps: [{ text: "我爸上週剛走，我現在很亂" }], bad: [/[？?]/], lastOnly: true },
  T11: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "我一個人養兩個小孩，最怕我倒下他們沒人管" }], bad: [] },
  T12: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "沒什麼特別原因" }, { text: "我沒有保單" }, { any: true }, { text: "啊其實公司有團保" }], bad: [],
    facts: { existing_policy: /團保|有/ } },
  T13: { steps: [{ opt: "想看看我的保單夠不夠" }, { text: "老婆跟一個小孩靠我" }, { text: "最怕生病沒收入" }, { text: "有幾張，不太清楚內容" }], bad: [/照顧費/] },
  T15: { steps: [{ opt: "想看看我的保單夠不夠" }, { opt: "沒什麼" }, { any: true }, { any: true }, { any: true }], bad: [] },
  T16: { steps: [{ opt: "想算算未來需要準備多少錢" }, { any: true }], bad: [/照顧|看護|中風/],
    expect: [[0, /擔心/]] },   // 先問財務版的「最擔心」，再接年齡題
};
// 每條都不能出現：AI 自言自語、念出內部指令、markdown（4-ai）
const COMMON_BAD = [/不行，|不能說|這樣講就好|下一題|這一輪|最後問|撰寫考量|```|\*\*/];

const strip = h => String(h ?? "").replace(/<[^>]+>/g, "");

async function runOne(id, round) {
  const sc = S[id];
  const key = process.env.DEV_LOGIN_KEY && !/localhost|127\.0\.0\.1/.test(BASE) ? `&key=${encodeURIComponent(process.env.DEV_LOGIN_KEY)}` : "";
  const login = await fetch(`${BASE}/api/dev-login?as=new-customer${key}`, { redirect: "manual" });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`測試登入失敗（HTTP ${login.status}）：確認 dev server 開著、DEV_LOGIN=1`);
  const H = { cookie, "content-type": "application/json" };
  let snap = await (await fetch(`${BASE}/api/consult`, { method: "POST", headers: H, body: "{}" })).json();
  const log = [], ms = [], replies = [];
  let seen = snap.messages.length, broken = null;
  for (const m of snap.messages) log.push(`AI: ${strip(m.content.html ?? m.content.text)}`);
  for (const step of sc.steps) {
    const p = snap.pending;
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
  log.push(`右欄：${snap.facts.map(f => `${f.label ?? f.key}=${f.display}`).join("｜")}`);

  const checked = sc.lastOnly ? replies.slice(-1) : replies;
  const replyText = checked.flat().map(x => x.text).join("\n");
  const allText = replies.flat().map(x => `${x.text}\n${x.chips.join("\n")}`).join("\n");
  const fails = [
    ...(broken ? [broken] : []),
    ...sc.bad.filter(re => re.test(replyText)).map(re => `出現 ${re}`),
    ...COMMON_BAD.filter(re => re.test(allText)).map(re => `出現 ${re}`),
    ...(sc.expect ?? []).filter(([i, re]) => !re.test((replies[i] ?? []).map(x => x.text).join("\n"))).map(([i, re]) => `第 ${i + 1} 步的回覆應符合 ${re}`),
    ...Object.entries(sc.facts ?? {}).filter(([k, re]) => !re.test(facts[k] ?? "")).map(([k, re]) => `右欄 ${k}=${facts[k] ?? "（沒記）"}，應符合 ${re}`),
  ];
  const out = { id, round, ok: fails.length === 0, fails, ms, log };
  fs.writeFileSync(path.join(OUT, `${id}-${round}.json`), JSON.stringify(out, null, 1));
  return out;
}

const ids = arg("only")?.split(",") ?? Object.keys(S);
for (const id of ids) if (!S[id]) { console.error(`沒有情境 ${id}`); process.exit(2); }
const jobs = ids.flatMap(id => Array.from({ length: ROUNDS }, (_, r) => [id, r + 1]));
const results = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (jobs.length) {
    const [id, r] = jobs.shift();
    try { results.push(await runOne(id, r)); }
    catch (e) { results.push({ id, round: r, ok: false, fails: [String(e)], ms: [] }); }
  }
}));

const allMs = results.flatMap(r => r.ms);
let failed = 0;
for (const id of ids) {
  const rs = results.filter(r => r.id === id).sort((a, b) => a.round - b.round);
  const pass = rs.filter(r => r.ok).length;
  if (pass < rs.length) failed++;
  console.log(`${pass === rs.length ? "✓" : "✗"} ${id}  ${pass}/${rs.length} 輪通過`);
  for (const r of rs) for (const f of r.fails) console.log(`    #${r.round} ${f}`);
}
console.log(`\n${ids.length - failed}/${ids.length} 條全過｜每輪平均 ${(allMs.reduce((a, b) => a + b, 0) / Math.max(allMs.length, 1) / 1000).toFixed(1)} 秒｜「應該怎麼接」請看 ${OUT}/*.json`);
process.exit(failed ? 1 : 0);
