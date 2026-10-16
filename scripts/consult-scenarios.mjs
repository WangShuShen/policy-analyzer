#!/usr/bin/env node
/*
 * AI 諮詢情境回歸測試（100_Todo/projects/RADIA-v2-諮詢測試情境.md：4-au 自由對話 F01–F36、語氣組 G1–G3，加出口接後段的 T16、T20–T29）。
 * 用真的 AI 跑：每條開一個新的測試客戶（/api/dev-login?as=new-customer），照劇本點選項／打字，
 * 自動檢查「不能出現」欄；「應該怎麼接」要人看，所以每輪的完整對話另存成 JSON。
 * T14（選項夾帶金額）沒辦法從畫面逼 AI 產生，改由 compliance 單元測試涵蓋。
 * 共通檢查（測試情境 C1–C9）：不重問（C2）、衛教（C3）、有邀約且理由對上（C5）、急件快（C6）、不推太兇（C7）、少術語（C8）、三輪不能一樣（C9）。
 *
 * 用法：
 *   node scripts/consult-scenarios.mjs                       # 全部，每條 3 輪（AI 每次講法不同，三次都要過）
 *   node scripts/consult-scenarios.mjs --rounds 1 --only F01,F02
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

// 劇本：{opt:"選項文字片段"} 點選項｜{text:"..."} 打字｜{any:true} 點第一個選項（沒有選項就打「嗯」）｜{exit:true} 點出口按鈕（好，我傳保險存摺／幫我算算看）
// 真 AI 自己寫選項，同樣意思字會不一樣：劇本寫的字在這裡列同義詞，任一個對上就算（10/15 真 AI 回歸 T06 遇過「就是想確認一下」）
const OPT_SYNONYMS = {
  "沒什麼": ["沒什麼", "就是想確認", "單純想確認", "只是想確認", "沒特別", "單純"],
};
// facts：最後右欄該記成什麼｜expect：[第幾步, 那一步的 AI 回覆要符合]
// bad 只比對 AI 回覆本文（不含選項）：「老了要人照顧」這種擔心選項是正常的，10/12 的 bug 是追問照顧費
const TOOL_WORDS = /投資型|變額|利變|利率變動|儲蓄險|儲蓄型|月配息|類全委|萬能/;
const MONEY = /\d[\d,，.]*\s*(萬|元)/;
// 自由對話（4-au）：開頭打字，之後點 AI 給的第一個選項，最多再 4 句；一出現邀約（offer）就停
// edu：要有的一般衛教（C3）｜hook：邀約那句要提到他的事（C5）｜offer：要出現的出口｜urgent：第 2 句以內要邀（C6）｜terms：允許 AI 講專有名詞（C8）
const chat = (texts, extra = {}) => ({
  steps: [...texts.map(t => typeof t === "string" ? { text: t } : t), ...Array.from({ length: 4 }, () => ({ any: true }))],
  untilOffer: true, offer: /./, realAI: true, bad: [], ...extra,
});
// 出口後要走的健康路線：醫療趨勢卡後的反應題 → 「好，我傳」
const TO_UPLOAD = [{ text: "我想看懂自己的保單" }, { exit: true }, { any: true }, { any: true }];
const S = {
  // ── 百百種人（RADIA-v2-諮詢測試情境.md F01～F36）──
  F01: chat(["啊我個人保單怎麼看"], { edu: /第一頁|保到幾歲|保障到|繳到|繳費/, offer: /upload|booking/, bad: [/最近(是)?發生(了)?什麼事/] }),   // 顧問截圖原句
  F02: chat(["理賠金怎麼那麼少", "住院開刀，自費的幾乎沒賠"], { edu: /上限|天數|範圍|等待期/, hook: /收據|保單上|一項/, bad: [MONEY] }),
  F03: chat(["我上個月剛買一張醫療險，想確認有沒有買對"], { bad: [/買對了|買錯了|建議(你)?退/] }),
  F04: chat(["我什麼都不懂，要從哪裡開始"], { edu: /生病|意外|走了|身故|存摺|列出|第一頁/ }),
  F05: chat(["保險公司說不賠，我該怎麼辦"], { urgent: true, edu: /原因|理由|等待期|健康狀況|範圍/, bad: [/一定(能|會)賠|應該可以爭取/] }),
  F06: chat(["我想解約，繳不下去了"], { urgent: true, edu: /拿回|比繳的少|保障.{0,4}沒/, bad: [/建議你解約|不要解約/] }),
  F07: chat(["想幫爸媽整理保單，他們也不知道自己買了什麼"], { offer: /booking/, bad: [/上傳(爸媽|他們|父母)的/] }),
  F08: chat(["實支實付是什麼？", "那我的有沒有？"], { edu: /收據|實際/, terms: true, bad: [/你(的)?(有|沒有)實支實付/] }),
  F09: chat(["等待期是什麼意思"], { edu: /一段時間|天|之後才/, terms: true, offer: null }),
  F10: { steps: [{ text: "理賠的事想問" }, { any: true }, { text: "我可以直接約顧問嗎" }], bad: [/[？?]/], lastOnly: true, lastOffer: "booking" },
  F11: chat(["嗯", "不知道", "隨便"]),
  F12: { steps: [{ text: "你好" }], bad: [/聽懂|從上面的選項挑/] },
  F13: chat(["業務員一直叫我加保，我需要嗎"], { bad: [/你(不|不用|不需要|需要)加保|業務(員)?(在)?騙你/] }),
  F14: chat(["我先生上個月走了，保險不知道要怎麼申請"], { urgent: true, edu: /證明|除戶|文件/ }),
  F15: chat(["我爸中風住院，保險可以賠什麼"], { urgent: true, edu: /證明|收據|申請書|文件/, bad: [/一定(會|能|可以)?賠|保證/] }),
  F16: chat(["我剛生小孩，要幫他保什麼"], { bad: [/建議(你)?(買|保)|可以(買|保)(一張)?(醫療|意外|壽險|重疾|癌症)/, MONEY] }),
  F17: chat(["公司有團保，還需要自己買嗎"], { edu: /離職|跟著公司|退休/, bad: [/(不用|一定要)(再)?(自己)?買/] }),
  F18: chat(["我 30 歲，保險要保多少才夠"], { bad: [MONEY, /倍/] }),
  F19: chat(["投資型保單是什麼"], { bad: [/變額|利變|儲蓄險|月配息|類全委|萬能/] }),
  F20: chat(["你推薦哪一家？"], { bad: [/人壽|產險|推薦你/] }),
  F21: chat(["我想開始存退休金"], { realAI: false, offer: /calc_ret/, bad: [TOOL_WORDS, /報酬率?\s*\d/] }),
  F22: chat(["房子想留給小孩，要繳很多稅嗎"], { realAI: false, offer: /calc_tax/, bad: [/免(遺產|贈與)?稅|一定(省|比較省)/] }),
  F23: chat(["小孩以後念大學要準備多少"], { realAI: false, offer: /calc_edu/, bad: [MONEY] }),
  F24: chat(["我保了好幾張，每個月繳好多，是不是保太多"], { offer: /upload|booking/, bad: [/保太多了|保太少了|確實(保)?太多/] }),
  F25: chat(["保單是我媽以前幫我買的，我完全不知道內容"], { offer: /upload|booking/, edu: /存摺|第一頁|保障到|繳費/ }),
  F26: chat(["我有乳癌病史，還買得到保險嗎"], { edu: /告知|照實/, bad: [/一定(會)?過|(應該|還是|都)(買得到|可以保)|(就)?買不到了/] }),
  F27: chat(["理賠要準備什麼"], { edu: /證明|收據|申請書/, offer: null, links: ["/guide/claim"] }),
  F28: chat(["我朋友 35 歲得癌症，我好怕"], { facts: { trigger: /朋友/ }, bad: [/你(得了|罹患)/] }),
  F29: chat(["保險存摺是什麼？要去哪裡弄"], { edu: /清單|列出|所有(的)?保單/, offer: /upload|booking/, links: ["/guide/passbook"] }),
  F30: chat(["我只是看看，不想留資料"], { offer: null, bad: [/你(今年|現在)?幾歲|你的收入|你的(身體|健康)狀況|不會(記|留)|不用留(任何)?資料/] }),
  F31: chat(["照收據賠的跟照天數賠的哪個好"], { edu: /收據|天數/, bad: [/你比較適合|建議你(選|買)/] }),
  F32: chat(["我的保單要繳到幾歲？我看不懂"], { edu: /第一頁|繳費|年期|繳到/, offer: /upload|booking/ }),
  F33: chat(["我單親，一個人養兩個小孩，最怕我倒下他們沒人管"], { bad: [/家裡(有)?誰(是)?靠你|最擔心(的是)?(哪|什麼)/] }),
  F34: { steps: [{ text: "asdf" }, { text: "？？" }], bad: [], differ: [0, 1] },
  F35: chat(["你們這些保險的都在騙人吧"], { offer: null, bad: [/我們不一樣|你誤會了|其實保險(很|是)好/] }),
  F36: chat(["阮後生叫我來問，阮的保單毋知有路用無"], { offer: /upload|booking/ }),
  // 主管 10/16（顧問截圖）：問怎麼上傳、存摺去哪弄 → 回覆下面一定有教學連結，AI 不自己講步驟
  F37: chat(["怎麼上傳"], { realAI: false, offer: null, links: ["/guide/passbook"] }),
  F38: chat(["存摺去哪弄"], { realAI: false, offer: null, links: ["/guide/passbook"] }),
  // ── 語氣組（4-au 補充）：同一個問題三種口氣，同一輪的第一句回覆要明顯不同（跑完一起比，見 TONE_GROUP）──
  G1: { realAI: true, steps: [{ text: "怎麼辦！！保險只賠一點點，醫院帳單還要繳，我現在很慌" }], bad: [] },
  G2: { realAI: true, steps: [{ text: "欸 理賠怎麼都賠很少啊 哈" }], bad: [/辛苦|遺憾/] },
  G3: { realAI: true, steps: [{ text: "我的醫療附約實支實付，雜費限額好像算得比我預期低，是不是有除外責任？" }], bad: [], terms: true },

  // ── 出口接到原本的後段（模擬模式驗流程）──
  // 從對話按「幫我算算看」進財務：不再問「最擔心」「從哪一塊開始看」，直接問年齡
  T16: { steps: [{ text: "想算算退休要準備多少" }, { exit: true }], bad: [/哪一塊|最擔心的是哪一個/], expect: [[1, /幾歲/]] },
  // 上傳存摺 → 確認清單 → 送出「上傳好了」→ 走到「該補什麼」→ 約顧問 → 顧問端看得到案例區塊（A3b）
  // 模擬模式下存摺讀取回固定的示範保單（lib/passbook/read.ts）；真 AI 模式要真的檔案，所以只在 --mock 跑
  T20: { mockOnly: true, steps: [...TO_UPLOAD, { upload: true }], bad: [], panels: ["gaps"], advisorSees: "為什麼要補？看數據",
    customerSees: [/對著條款跟你說才準/], customerNot: [/這是規定/] },
  // N7：每人每天 AI 用量上限。暫時把上限調到 0.000001 美元（模擬模式每次呼叫記 1 微美元），測完一定還原。
  // 改的是全站設定，所以 T21 等其他情境都跑完才一輪一輪單獨跑（exclusive）
  T21: { mockOnly: true, exclusive: true, run: runCap },
  // 4-ap：面談前客戶端不出現工具類型（投資型、變額……），只講路線；顧問端照樣看得到完整配置
  T22: { steps: [{ text: "想算算退休要準備多少" }, { exit: true }, { opt: "30 幾" }, { opt: "願意承受波動" }], bad: [TOOL_WORDS],
    panels: ["route"], customerSees: [/建議路線/], customerNot: [TOOL_WORDS, /有時間漲回來|賺回來/], snapNot: TOOL_WORDS, advisorFin: TOOL_WORDS },
  // 4-at：財務路線走到底——面談前就看得到「下一步」（去挑顧問），我的分析有上傳存摺的區塊
  T26: { steps: [{ text: "想算算退休要準備多少" }, { exit: true }, ...Array.from({ length: 11 }, () => ({ any: true }))], bad: [],
    panels: ["fsum"], customerSees: [/id="upload"/, /上傳你的保險存摺/, /去挑顧問/], expect: [[12, /我的分析」就能傳/]], links: ["/analysis#upload"] },
  // 4-at：健康路線跳過上傳 → 我的頁「去上傳」連到我的分析 → 從我的分析傳（不帶對話）→ 確認清單 → 結果出現在我的分析
  T27: { mockOnly: true, steps: [...TO_UPLOAD, { skipUpload: true }], bad: [], customerSees: [/id="upload"/, /上傳你的保險存摺/], meSees: [/href="\/analysis#upload"/],
    analysisUpload: true },
  // 4-at（主管 10/15）：先在我的分析傳了存摺，對話走到上傳那一步就跳過——說「你已經傳過了（N 張）」＋「要換一份重新上傳」
  T28: { mockOnly: true, steps: [TO_UPLOAD[0], { preUpload: true }, ...TO_UPLOAD.slice(1)], bad: [], expect: [[4, /你已經傳過保險存摺了（\d+ 張）/]], links: ["/analysis#upload"], notPending: "upload" },
  // 對話停在上傳那一步 → 跑去我的分析傳 → 回到對話：直接往下，不再叫他傳
  T29: { mockOnly: true, steps: [...TO_UPLOAD, { preUpload: true }, { reopen: true }], bad: [], expect: [[5, /你已經傳過保險存摺了（\d+ 張）/]], links: ["/analysis#upload"], notPending: "upload" },
};
// 語氣組：同一輪三種口氣的第一句回覆要不一樣
const TONE_GROUP = ["G1", "G2", "G3"];
// AI 講專有名詞前，他自己要先講過（C8）
const TERMS = /條款|實支實付|日額型|附約|除外|要保人/;
// 4-ax：推銷感的詞
const PUSHY = /需求|補強|缺口|加保/;
const PASSBOOK_STEPS = /自然人憑證|健保卡|晶片金融卡|行動身分|白金|公會|臨櫃|100 ?元/;
// 指令裡的範例回覆（C9：不能照抄）
const EXAMPLE_REPLIES = new Set([...fs.readFileSync(new URL("../lib/consult/ai.ts", import.meta.url), "utf8").matchAll(/"reply":"([^"]+)"/g)].map(m => m[1].replace(/<[^>]+>/g, "")));
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
    if (step.reopen) {
      log.push("(回到對話)");
      snap = await (await fetch(`${BASE}/api/consult?id=${snap.conversation.id}`, { headers: H })).json();
      const turn = [];
      for (const m of snap.messages.slice(seen)) if (m.role === "assistant") { const text = strip(m.content.html ?? m.content.text ?? ""); turn.push({ text, chips: [] }); log.push(`AI: ${text}`); }
      replies.push(turn);
      seen = snap.messages.length;
      continue;
    }
    if (step.preUpload) {
      // 不經過對話、直接像在我的分析那樣傳（不帶對話 id），等確認清單、按確認、等讀完
      log.push("(從我的分析上傳存摺)");
      try { await uploadAndConfirm(H, null); } catch (e) { broken = String(e.message ?? e); break; }
      replies.push([]);
      continue;
    }
    if (step.skipUpload) {
      if (p?.kind !== "upload") { broken = `走不到上傳存摺那一步（pending=${p?.kind}）`; break; }
      log.push("(先不傳)");
      const r = await fetch(`${BASE}/api/consult/turn`, { method: "POST", headers: H,
        body: JSON.stringify({ conversationId: snap.conversation.id, stepId: p.uploadStepId, skipUpload: true }) });
      const j = await r.json();
      if (!r.ok) { broken = `跳過上傳 HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`; break; }
      snap = j;
      const turn = [];
      for (const m of snap.messages.slice(seen)) if (m.role === "assistant") { const text = strip(m.content.html ?? m.content.text ?? ""); turn.push({ text, chips: [] }); log.push(`AI: ${text}`); }
      replies.push(turn);
      seen = snap.messages.length;
      continue;
    }
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
    if (step.text || (step.any && !opts.length)) { const t = step.text ?? "嗯"; body = { text: t }; log.push(`客戶: ${t}`); }
    else if (step.exit) {
      const i = opts.findIndex(o => o === "好，我傳保險存摺" || o === "幫我算算看");
      if (i < 0) { broken = `沒有出口按鈕，選項：${opts.join("／") || "（沒有選項）"}`; break; }
      body = { option: i }; log.push(`(點) ${opts[i]}`);
    } else {
      const words = OPT_SYNONYMS[step.opt] ?? [step.opt];
      const i = step.any ? 0 : opts.findIndex(o => words.some(w => o.includes(w)));
      if (i < 0) { broken = `找不到選項「${words.join("｜")}」，AI 實際給的選項：${opts.join("／") || "（沒有選項）"}`; break; }
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
      turn.push({ text, chips: m.content.chips ?? [], offer: m.content.offer, ask: m.content.ask, urgent: m.content.urgent, byAsk: m.content.byAsk });
      log.push(`AI: ${text}${m.content.chips?.length ? `  [選項] ${m.content.chips.join("／")}` : ""}${m.content.offer && m.content.offer !== "none" ? `  [邀約] ${m.content.offer}` : ""}${m.content.ask ? `  [問] ${m.content.ask}` : ""}`);
    }
    replies.push(turn);
    seen = snap.messages.length;
    if (sc.untilOffer && turn.some(x => x.offer && x.offer !== "none")) break;
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
      const bookingId = await bookSlot(H, advisorId);
      const ac = await devLogin("advisor", advisorId);
      const html = await (await fetch(`${BASE}/clients/${userId}?tab=fin&conv=${snap.conversation.id}`, { headers: { cookie: ac } })).text().finally(() => cancelBooking(H, bookingId, log));
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
  // 訊息下面的按鈕／小連結（4-at）
  const links = snap.messages.flatMap(m => m.content.link ? [m.content.link.href] : []);
  const linkFail = !broken && (sc.links ?? []).filter(h => !links.includes(h)).map(h => `對話裡沒有連到 ${h} 的按鈕`).join("；") || null;
  const pendFail = !broken && sc.notPending && snap.pending?.kind === sc.notPending ? `對話還停在 ${sc.notPending}` : null;
  // 我的頁：上傳存摺的連結要連到我的分析的上傳區塊（4-at）
  let meFail = null;
  if (sc.meSees && !broken) {
    const html = await (await fetch(`${BASE}/me`, { headers: { cookie } })).text();
    const miss = sc.meSees.filter(re => !re.test(html));
    log.push(`我的頁：${miss.length ? "不符" : "符合"}`);
    if (miss.length) meFail = miss.map(re => `我的頁看不到 ${re}`).join("；");
  }
  // 從我的分析上傳（不帶對話）→ 確認清單 → 讀完後上傳區塊換成「你現在的保障」的結果（4-at）
  let anzUpFail = null;
  if (sc.analysisUpload && !broken) {
    try {
      const v = await uploadAndConfirm(H, async () => {
        const mid = await (await fetch(`${BASE}/analysis`, { headers: { cookie } })).text();
        if (!/我讀到|對嗎|確認/.test(mid)) throw new Error("我的分析沒有出現存摺確認清單");
      });
      const html = await (await fetch(`${BASE}/analysis`, { headers: { cookie } })).text();
      if (/上傳你的保險存摺/.test(html)) throw new Error("上傳完，我的分析還在叫他上傳");
      if (!/張保單合併/.test(html)) throw new Error("上傳完，我的分析看不到「你現在的保障」的結果");
      log.push(`從我的分析上傳：確認 ${v.policies.length} 張 → 結果出現`);
    } catch (e) { anzUpFail = String(e.message ?? e); }
  }
  // 顧問端：客戶約了顧問之後，顧問的客戶頁「保障分析」要看得到案例區塊
  let advisorFail = null;
  if (sc.advisorSees && !broken) {
    try {
      const userId = JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[1], "base64url").toString()).advisorId;
      const advisorId = arg("advisor", "dev-adv-b");
      const bookingId = await bookSlot(H, advisorId);
      const al = await fetch(`${BASE}/api/dev-login?as=advisor&id=${advisorId}${KEY ? `&key=${encodeURIComponent(KEY)}` : ""}`, { redirect: "manual" });
      const ac = al.headers.get("set-cookie")?.split(";")[0];
      const html = await (await fetch(`${BASE}/clients/${userId}?tab=gap`, { headers: { cookie: ac } })).text().finally(() => cancelBooking(H, bookingId, log));
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
    ...(sc.differ && !broken && strip((replies[sc.differ[0]] ?? []).map(x => x.text).join()) === strip((replies[sc.differ[1]] ?? []).map(x => x.text).join())
      ? [`第 ${sc.differ[0] + 1}、${sc.differ[1] + 1} 步回了一模一樣的話`] : []),
    ...(sc.panels ?? []).filter(k => !shownPanels.includes(k)).map(k => `右欄沒有出現 ${k}`),
    ...(customerFail ? [customerFail] : []),
    ...(meFail ? [meFail] : []),
    ...(linkFail ? [linkFail] : []),
    ...(pendFail ? [pendFail] : []),
    ...(anzUpFail ? [anzUpFail] : []),
    ...(snapFail ? [snapFail] : []),
    ...(finFail ? [finFail] : []),
    ...(advisorFail ? [advisorFail] : []),
    ...Object.entries(sc.facts ?? {}).filter(([k, re]) => !re.test(facts[k] ?? "")).map(([k, re]) => `右欄 ${k}=${facts[k] ?? "（沒記）"}，應符合 ${re}`),
  ];
  // ── 4-au 共通檢查 ──
  const chatTurns = replies.flat().filter(x => x.offer);          // 自由對話的回覆（有 offer 欄位）
  const asks = chatTurns.flatMap(x => x.ask ? [x.ask] : []);
  const dupAsk = asks.find((k, i) => asks.indexOf(k) !== i);
  if (dupAsk) fails.push(`C2 同一件事問了兩次：${dupAsk}`);
  const offers = chatTurns.filter(x => x.offer !== "none");
  if (!broken && sc.offer && !offers.some(x => sc.offer.test(x.offer))) fails.push(`C5 沒有邀約到 ${sc.offer}（實際：${offers.map(x => x.offer).join("、") || "沒有邀約"}）`);
  if (!broken && sc.lastOffer && chatTurns.at(-1)?.offer !== sc.lastOffer) fails.push(`最後一句應該邀 ${sc.lastOffer}（實際：${chatTurns.at(-1)?.offer}）`);
  if (!broken && sc.urgent && !chatTurns.slice(0, 2).some(x => x.offer !== "none")) fails.push("C6 急件第 2 句以內沒有邀約");
  if (offers.filter(x => !x.byAsk).length > 3) fails.push("C7 主動邀約超過 3 次");
  if (!MOCK && !broken) {
    // 他講過的話（打的字、點的選項）：他先講的名詞 AI 才能跟著用
    const said = log.filter(l => /^(客戶: |\(點\) )/.test(l)).map(l => l.replace(/^(客戶: |\(點\) )/, ""));
    for (let i = 0; i < replies.length && !sc.terms; i++) {
      const before = said.slice(0, i + 1);
      // 只看 AI 自由對話的回覆；劇本固定台詞（例如 s135）是顧問審過的
      const hit = replies[i].filter(x => x.offer).map(x => x.text.match(TERMS)?.[0]).find(t => t && !before.some(s => s.includes(t)));
      if (hit) { fails.push(`C8 他沒講過就用了專有名詞「${hit}」`); break; }
    }
    const all = replies.flat().map(x => x.text).join("\n");
    if (sc.edu && !sc.edu.test(all)) fails.push(`C3 沒有出現一般衛教 ${sc.edu}`);
    const inviteLine = offers[0]?.text ?? "";
    if (sc.hook && offers.length && !sc.hook.test(inviteLine)) fails.push(`C5 邀約理由沒對上他的事 ${sc.hook}`);
    // 4-ax：AI 自由對話的話和選項不用推銷感的詞（他自己先講了才可以）
    const pushy = replies.flat().filter(x => x.offer).flatMap(x => [x.text, ...x.chips]).join("\n").match(PUSHY)?.[0];
    if (pushy && !said.some(s => s.includes(pushy))) fails.push(`4-ax 用了推銷感的詞「${pushy}」`);
    // 保險存摺的申請方式 AI 不自己講（講錯過：證件、公會、付費），一律附小教室連結
    const steps = replies.flat().filter(x => x.offer).map(x => x.text).join("\n").match(PASSBOOK_STEPS)?.[0];
    if (steps) fails.push(`AI 自己講了保險存摺的申請方式「${steps}」`);
    const copied = replies.flat().find(x => EXAMPLE_REPLIES.has(x.text));
    if (copied) fails.push(`C9 照抄指令範例：${copied.text.slice(0, 30)}…`);
  }
  const deferred = MOCK && !!sc.realAI;
  const out = { id, round, ok: fails.length === 0 || deferred, deferred, fails, ms, log, said: replies.map(t => t.map(x => x.text).join("\n")) };
  fs.writeFileSync(path.join(OUT, `${id}-${round}.json`), JSON.stringify(out, null, 1));
  return out;
}

// 像在我的分析那樣上傳存摺（不帶對話）：等確認清單 →（beforeConfirm 檢查畫面）→ 全部保留 → 等讀完。模擬模式讀取回固定的示範保單
async function uploadAndConfirm(H, beforeConfirm) {
  const up = await fetch(`${BASE}/api/passbook`, { method: "POST", headers: H,
    body: JSON.stringify({ conversationId: null, content: { kind: "text", pages: ["情境測試用存摺：模擬模式下內容不會被讀，讀取會回固定的示範保單。上傳端要求至少 30 個字。"] } }) });
  if (!up.ok) throw new Error(`從我的分析上傳失敗 HTTP ${up.status}`);
  const waitFor = async (want) => {
    for (let i = 0; i < 60; i++) {
      const v = await (await fetch(`${BASE}/api/passbook`, { headers: H })).json();
      if (v.upload?.status === want) return v;
      if (v.upload?.status === "failed") throw new Error(`存摺讀取失敗：${v.upload.error}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`等不到存摺狀態 ${want}`);
  };
  const v = await waitFor("confirming");
  if (beforeConfirm) await beforeConfirm();
  const c = await fetch(`${BASE}/api/passbook/confirm`, { method: "POST", headers: H,
    body: JSON.stringify({ uploadId: v.upload.id, items: v.policies.map(x => ({ id: x.id, keep: true })) }) });
  if (!c.ok) throw new Error(`確認清單失敗 HTTP ${c.status}`);
  await waitFor("done");
  return v;
}

// 約顧問：同時跑好幾輪（T20、T22）會搶同一個時段，隨機挑一個；被搶走（409 slot_taken）就重新拿時段再約，最多 5 次。
// 客戶只能在面談前 2 小時以前取消，所以只挑 3 小時以後的時段；回傳預約 id，看完顧問端就用 cancelBooking 取消
async function bookSlot(H, advisorId) {
  for (let i = 0; i < 5; i++) {
    const free = ((await (await fetch(`${BASE}/api/advisors/${advisorId}/slots`, { headers: H })).json()).slots ?? [])
      .filter(x => Date.parse(x.startsAt) > Date.now() + 3 * 3600_000);
    const startsAt = free[Math.floor(Math.random() * Math.min(free.length, 40))]?.startsAt;
    if (!startsAt) throw new Error("這位顧問沒有可約的時段");
    const b = await fetch(`${BASE}/api/bookings`, { method: "POST", headers: H, body: JSON.stringify({ advisorId, startsAt, mode: "online" }) });
    if (b.ok) return (await b.json()).id;
    const t = await b.text();
    if (b.status !== 409 || !t.includes("slot_taken")) throw new Error(`約顧問失敗 HTTP ${b.status} ${t.slice(0, 150)}`);
  }
  throw new Error("約顧問失敗：連續 5 次時段都被搶走");
}

// 測試約的面談用客戶取消 API 取消，不然開發版的顧問時段會被測試預約佔滿（4-ar 起一天只放得下約 3 場）
async function cancelBooking(H, id, log) {
  const r = await fetch(`${BASE}/api/bookings/${id}/cancel`, { method: "POST", headers: H });
  if (!r.ok) throw new Error(`測試預約沒取消成功（HTTP ${r.status}，id ${id}）`);
  log.push("測試預約已取消");
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

// C9：同一情境三輪的完整回覆不能有兩輪一模一樣；語氣組同一輪三種口氣的第一句要不一樣（真 AI 才檢查）
if (!MOCK) {
  for (const id of ids) {
    const rs = results.filter(r => r.id === id && r.said);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
      if (rs[i].said.join("|") === rs[j].said.join("|")) { rs[j].ok = false; rs[j].fails.push(`C9 跟第 ${rs[i].round} 輪一模一樣`); }
  }
  for (let r = 1; r <= ROUNDS; r++) {
    const first = TONE_GROUP.map(id => results.find(x => x.id === id && x.round === r)?.said?.[0]).filter(Boolean);
    if (first.length === TONE_GROUP.length && new Set(first.map(t => t.split(/[，。！？]/)[0])).size < first.length) {
      for (const x of results.filter(x => TONE_GROUP.includes(x.id) && x.round === r)) { x.ok = false; x.fails.push("語氣組：三種口氣的第一句有一樣的"); }
    }
  }
}

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
