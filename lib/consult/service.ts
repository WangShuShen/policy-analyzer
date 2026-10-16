import { advance, askAt, answerFromOption, applyAnswer, nearestOption, passUpload, stepAt,
  type Answer, type FlowEvent, type FlowState, type Pending } from "./engine";
import { STEPS } from "./script";
import { extractAnswer, reply, confirmLine, WANT_ASK_LINE, extractNeeds, needTurn, type Usage, type Line, type NeedExtraction, type Offer, type Invite } from "./ai";
import { DECLINED, HEALTH_SLOTS, askedBefore, hasPolicy, slotOf } from "./needs";
import * as store from "./store";
import { buildAnalysis, publicView, saveSnapshotIfChanged, type AnalysisView } from "./analysis";
import { liveContent } from "@/lib/content/store";
import { liveSlot, liveStep } from "./live";
import { view as passbookView } from "@/lib/passbook/service";
import { UPLOAD_PATH } from "./paths";
import { capReached } from "@/lib/admin/usage";

/*
 * 一輪對話（實作設計 I1）：
 *   點選項 → 值是確定的，不呼叫 AI
 *   打字   → Haiku 抽取 → 對到答案就記下、Opus 回一句 → 引擎接著往下走
 *            岔題問知識 → Opus 簡短回答並拉回 → 停在同一題
 *            聽不懂     → Opus 請他再說一次 → 停在同一題
 *            想約顧問   → Opus 說可以、指出約顧問按鈕 → 停在同一題
 *   自由對話（4-au，開場的 chat 步驟，不分路線）：點選項或打字都一樣
 *            Haiku 讀整段對話記筆記、判斷意圖與急件 → 程式算能不能邀約 → Opus 站在顧問角度接話＋給選項
 *            他點出口按鈕（好，我傳保險存摺／幫我算算看）→ 設好分支，引擎接著往下（醫療趨勢 → 上傳；或財務試算）
 */

export interface Snapshot {
  conversation: { id: string; title: string; status: string; branch: string | null; sub: string | null };
  messages: store.StoredMessage[];
  facts: (store.StoredFact & { label: string; options: { index: number; label: string }[] | null })[];
  pending: Pending;
  analysis: AnalysisView;          // 右欄計算區塊（鎖住的內容不在裡面）
  phase: number;                   // 原型上方三階段：0 聊出需求｜1 看現況｜2 補強建議
  paused: boolean;                 // N7：今天的 AI 用量到上限了，先停（講過的都留著，台灣時間 0 點自動恢復）
}

/** 目前走到第幾階段：游標之前、屬於這個分支的最後一個 ph 步驟 */
function phaseAt(st: FlowState): number {
  let p = 0;
  for (let i = 0; i < Math.min(st.cursor, STEPS.length); i++) {
    const s = STEPS[i];
    if (s.t === "ph" && (!s.br || s.br === st.branch) && (!s.sub || s.sub === st.sub)) p = Number(s.k);
  }
  return p;
}

/** 需求點的中文名稱與右欄可以改成哪些選項（決定分支的題目不能改 → options=null） */
function factMeta(key: string): { label: string; options: { index: number; label: string }[] | null } {
  const slot = slotOf(key);
  if (slot) return { label: slot.label, options: slot.editable ? slot.values.map((label, index) => ({ index, label })) : null };
  for (const s of STEPS) {
    if (s.t !== "ask" || !s.keys.includes(key)) continue;
    const mine = s.o.map((o, index) => ({ o, index })).filter(x => x.o.key === key);
    const label = mine[0]?.o.label ?? key;
    if (s.o.some(o => o.r || o.f)) return { label, options: null };
    return { label, options: mine.map(x => ({ index: x.index, label: x.o.v ?? x.o.x })) };
  }
  return { label: key, options: null };
}

export class StaleTurnError extends Error {
  constructor() { super("這一題已經回答過了，畫面會更新到最新狀態"); }
}

/** 後台發布版的筆記項目（整理員的指令用） */
const liveSlots = async () => { const lc = await liveContent(); return HEALTH_SLOTS.map(x => liveSlot(lc, x)); };

const pendingAt = async (st: FlowState): Promise<Pending> => advance({ ...st }, await liveContent()).pending;

const isNeedStep = (stepId: string | undefined) => !!stepId && STEPS.find(s => s.id === stepId)?.t === "need";

/** 上一則 AI 訊息帶的選項（自由對話的選項是 AI 每輪產生的，跟著訊息加密存） */
function lastChips(msgs: store.StoredMessage[]): string[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const c = msgs[i].content;
    if (msgs[i].role === "user") return [];
    if (c.kind === "ai") return c.chips ?? [];
  }
  return [];
}

/** 上一句 AI 是不是「聽不懂」或「你想問什麼」（他接著打的字要照這個處理）；中間隔了他的話或別的就不算 */
function lastMark(msgs: store.StoredMessage[]): "clarify" | "want_ask" | undefined {
  const m = msgs[msgs.length - 1];
  return m?.role === "assistant" && m.content.kind === "ai" ? m.content.mark : undefined;
}

/** 自由對話現在能點的選項：他還沒開口 → 起頭範例；之後 → 上一則 AI 回覆帶的 */
const chipsFor = (msgs: store.StoredMessage[]) => msgs.some(m => m.role === "user") ? lastChips(msgs) : STARTERS;

function withChips(p: Pending, msgs: store.StoredMessage[]): Pending {
  if (p.kind !== "ask" || !p.ask || !isNeedStep(p.ask.stepId)) return p;
  return { ...p, ask: { ...p.ask, options: chipsFor(msgs) } };
}

/** 給 AI 看的對話紀錄：只取他說的話與 AI 說的話，最近 12 則 */
function historyOf(msgs: store.StoredMessage[]): Line[] {
  return msgs.flatMap((m): Line[] => m.content.kind === "user" ? [{ role: "user", text: m.content.text }]
    : m.content.kind === "ai" ? [{ role: "assistant", text: m.content.html.replace(/<[^>]+>/g, "") }] : []).slice(-12);
}

/** 把引擎吐出的事件存成訊息；phase／highlight 只是畫面效果，不存 */
async function persistEvents(convId: string, events: FlowEvent[], tag: string): Promise<void> {
  // content_version_id 記「哪一組後台內容＋哪一步」（I3：每段對話記錄它用的內容版本）
  for (const e of events) {
    if (e.type === "ai") await store.addMessage(convId, "assistant", { kind: "ai", html: e.html, ...(e.link ? { link: e.link } : {}) }, { stepId: e.stepId, versionTag: tag });
    else if (e.type === "trend") await store.addMessage(convId, "assistant", { kind: "trend", title: e.title, body: e.body, forYou: e.forYou }, { stepId: e.stepId, versionTag: tag });
    else if (e.type === "panel") await store.addMessage(convId, "assistant", { kind: "panel", key: e.key }, { stepId: e.stepId, versionTag: tag });
  }
}

/** 往下走到下一個需要使用者的地方，存事件與進度 */
async function runForward(userId: string, convId: string, st: FlowState): Promise<FlowState> {
  const lc = await liveContent();
  let next = st;
  for (;;) {
    const r = advance(next, lc);
    await persistEvents(convId, r.events, lc.tag);
    next = { ...next, cursor: r.cursor };
    // 已經傳過存摺（例如先在我的分析傳了）→ 不再叫他傳一次，直接往下（4-at）
    if (r.pending.kind === "upload" && await skipUploadIfDone(userId, convId)) { next = passUpload(next); continue; }
    await store.saveState(userId, convId, next, r.pending.kind === "done");
    return next;
  }
}

/** 傳過存摺（沒讀失敗）就記一句「你已經傳過了」＋「要換一份重新上傳」，回傳 true 讓對話跳過上傳那一步 */
async function skipUploadIfDone(userId: string, convId: string): Promise<boolean> {
  const { upload, counts } = await passbookView(userId);
  if (!upload || upload.status === "failed") return false;
  const n = counts.total - counts.removed - counts.others;
  await store.addMessage(convId, "assistant", { kind: "note",
    text: upload.status === "done" ? `📎 你已經傳過保險存摺了（${n} 張），我們直接看現況` : "📎 你已經傳過保險存摺了，還在整理，我們直接看現況",
    link: { href: UPLOAD_PATH, text: "要換一份重新上傳" } });
  return true;
}

async function snapshot(userId: string, convId: string): Promise<Snapshot> {
  const conv = (await store.getConversation(userId, convId))!;
  const st = await store.loadState(conv);
  const messages = await store.getMessages(conv.id);
  const facts = await store.getFacts(conv.id);
  const shown = messages.flatMap(m => m.content.kind === "panel" ? [m.content.key] : []);
  const { stuck: _stuck, ...pb } = await passbookView(userId);
  const analysis = await buildAnalysis(userId, facts, shown, false, pb);
  // 出現過計算區塊才存快照（只聊到來意、還沒算任何東西時不存）
  if (analysis.open.some(p => !("needsPolicies" in p)) || analysis.locked.length) {
    await saveSnapshotIfChanged(userId, conv.id, analysis.inputs, analysis.results);
  }
  return {
    conversation: { id: conv.id, title: conv.title ?? store.titleOf(conv.branch, conv.sub_route), status: conv.status, branch: conv.branch, sub: conv.sub_route },
    messages,
    facts: facts.map(f => ({ ...f, ...factMeta(f.key) })),
    pending: withChips(await pendingAt(st), messages),
    analysis: publicView(analysis),
    phase: phaseAt({ ...st, cursor: advance({ ...st }).cursor }),
    paused: await capReached(userId),
  };
}

/** 開新對話，或打開既有的（4-x：舊對話是「聊到一半」，不是封存檔） */
export async function open(userId: string, convId?: string | null): Promise<Snapshot> {
  if (convId) {
    const conv = await store.getConversation(userId, convId);
    if (!conv) throw new Error("找不到這段對話");
    // 停在上傳那一步、但已經從別的地方傳過了（4-at：我的分析）→ 回來時直接往下
    if (conv.status !== "done") {
      const st = await store.loadState(conv);
      const at = advance(st, await liveContent());
      if (at.pending.kind === "upload" && await skipUploadIfDone(userId, conv.id)) await runForward(userId, conv.id, passUpload({ ...st, cursor: at.cursor }));
    }
    return snapshot(userId, conv.id);
  }
  const conv = await store.createConversation(userId);
  await runForward(userId, conv.id, await store.loadState(conv));
  return snapshot(userId, conv.id);
}

/** 最近一段還沒聊完的對話；沒有就開新的 */
export async function resumeLatest(userId: string): Promise<Snapshot> {
  const list = await store.listConversations(userId);
  const active = list.find(c => c.status === "active");
  return open(userId, active?.id ?? null);
}

export type TurnInput = { stepId: string } & ({ option: number } | { text: string } | { skipUpload: true } | { uploaded: true });

export async function turn(userId: string, convId: string, input: TurnInput): Promise<Snapshot> {
  const conv = await store.getConversation(userId, convId);
  if (!conv) throw new Error("找不到這段對話");
  let st = await store.loadState(conv);
  // 引擎可能停在一連串 ai 步驟後面的題目上；先走到真正等待的位置
  st = { ...st, cursor: advance(st).cursor };
  const cur = stepAt(st.cursor);
  if (!cur || cur.id !== input.stepId) throw new StaleTurnError();   // 連點兩下、或開了兩個分頁
  // N7：今天用到上限就不再呼叫 AI（整理員、說話、第二層審查都在這一輪裡）。什麼都不動、不存這句，回目前的畫面
  // 點固定題目的選項本身不用 AI，但接著可能進需求點引導，一律先停，畫面也只剩約顧問（上傳存摺不受影響）
  if (("text" in input || "option" in input) && await capReached(userId)) return snapshot(userId, convId);

  if ("skipUpload" in input || "uploaded" in input) {
    if (cur.t !== "up") throw new StaleTurnError();
    // 上傳了 → 解析在背景跑，對話照常往下（P2）；跳過 → 面談前再傳也來得及
    await store.addMessage(convId, "assistant", "uploaded" in input
      ? { kind: "note", text: "📎 收到你的存摺了——我邊看邊跟你聊，讀好會出現在右邊" }
      : { kind: "note", text: "📎 保險存摺之後再傳也可以——面談前傳都來得及" });
    await runForward(userId, convId, passUpload(st));
    return snapshot(userId, convId);
  }

  if (cur.t === "need") {
    if (!("option" in input) && !("text" in input)) throw new StaleTurnError();
    await needRound(userId, convId, st, input);
    return snapshot(userId, convId);
  }

  const lc = await liveContent();
  const ask = askAt(st.cursor, lc);
  if (!ask) throw new StaleTurnError();

  if ("option" in input) {
    const opt = ask.o[input.option];
    if (!opt) throw new Error("沒有這個選項");
    const msgId = await store.addMessage(convId, "user", { kind: "user", text: opt.x });
    const a = answerFromOption(ask, opt);
    if (a.fact) await store.upsertFact(convId, userId, { ...a.fact, confidence: "clear", sourceMessageId: msgId });
    await runForward(userId, convId, applyAnswer(st, a));
    return snapshot(userId, convId);
  }

  // ── 自由輸入 ──
  const text = input.text.trim().slice(0, 1000);
  if (!text) throw new Error("請輸入內容");
  const question = lastQuestion(st.cursor, lc);
  const prevMark = lastMark(await store.getMessages(convId));
  const { result: ex, usage: exUsage } = await extractAnswer(ask, question, text);
  const userMsgId = await store.addMessage(convId, "user", { kind: "user", text }, { usage: exUsage });

  let answer: Answer | null = null;
  let estimated = false;
  if (ex.kind === "answer") {
    // 有確切數字就用確切數字（「38 歲」記 38，不是「30 幾」的代表值 35）；最接近的選項只拿來當統計級距
    const near = ex.value_number !== null ? nearestOption(ask, ex.value_number) : null;
    if (near) {
      const base = answerFromOption(ask, near);
      if (base.fact) {
        base.fact = { ...base.fact, number: ex.value_number, display: ex.display ?? base.fact.display };
        answer = base;
        estimated = ex.confidence === "estimated";
      }
    } else if (ex.option_index !== null) {
      answer = answerFromOption(ask, ask.o[ex.option_index]);
      estimated = ex.confidence === "estimated";
    } else if (ask.keys.length === 0) {
      answer = {};    // 反應題（「……我沒想過」）：講什麼都算回答了，不存需求點
    }
  }

  if (answer) {
    const recorded = answer.fact?.display ?? text;
    const r = await reply({ kind: "bridge", question, userText: text, recorded, estimated });
    await store.recordBlocks(convId, r.blocked, r.rewritten ? r.html : undefined);
    await saveReply(convId, r.html, r.usages, r.rewritten);
    if (answer.fact) await store.upsertFact(convId, userId, { ...answer.fact, confidence: estimated ? "estimated" : "clear", sourceMessageId: userMsgId });
    if (estimated && answer.fact) await store.addMessage(convId, "assistant", { kind: "ai", html: confirmLine(answer.fact.display) });
    await runForward(userId, convId, applyAnswer(st, answer));
  } else if (ex.kind === "want_to_ask" && prevMark !== "want_ask") {
    // 說想自己問、還沒講問題（顧問 10/15）：固定句，不用 AI；下一句當成問題
    await store.addMessage(convId, "assistant", { kind: "ai", html: WANT_ASK_LINE, mark: "want_ask" });
    await store.saveState(userId, convId, st, false);
  } else {
    const options = ask.o.map(o => o.x);
    // 剛問過「你想問什麼」→ 這句就是他的問題（沒對到選項、也不是要約顧問的話）。衛教界線照舊，投資型照擋（reply 的審查）
    const kind = prevMark === "want_ask" && ex.kind !== "book" ? "question" : ex.kind;
    const mode = kind === "question" ? { kind: "answer_question" as const, question, userText: text }
      : kind === "book" ? { kind: "book" as const, question, userText: text }
      : kind === "greeting" ? { kind: "greet" as const, question, userText: text, options }
      : { kind: "clarify" as const, question, userText: text, options, again: prevMark === "clarify" };
    const r = await reply(mode);
    await store.recordBlocks(convId, r.blocked, r.rewritten ? r.html : undefined);
    await saveReply(convId, r.html, r.usages, r.rewritten, mode.kind === "clarify" ? "clarify" : undefined);
    await store.saveState(userId, convId, st, false);   // 停在同一題，但更新最後互動時間
  }
  return snapshot(userId, convId);
}

// 一句話可能重產過（合規攔截），用量加總記在這則訊息上（I6）
const sumUsage = (usages: Usage[]): Usage => usages.reduce<Usage>((a, u) => ({ model: u.model, tokensIn: a.tokensIn + u.tokensIn, tokensOut: a.tokensOut + u.tokensOut, costMicroUsd: a.costMicroUsd + u.costMicroUsd }),
  { model: usages[0]?.model ?? "", tokensIn: 0, tokensOut: 0, costMicroUsd: 0 });

async function saveReply(convId: string, html: string, usages: Usage[], rewritten: boolean, mark?: "clarify") {
  await store.addMessage(convId, "assistant", { kind: "ai", html, ...(mark ? { mark } : {}) }, { usage: sumUsage(usages), rewritten });
}

// ── 自由對話（4-au）──────────────────────────────────────────────

/** 開場的起頭範例：點了等於幫他打這句話，不分路線（4-au Q3） */
export const STARTERS = ["我想看懂自己的保單", "理賠的事想問", "想算算退休要準備多少", "想幫爸媽整理保單"];

/** 出口按鈕：程式固定的字，AI 不能寫。「去約顧問」由畫面直接帶去 /advisors（ConsultChat），不會送到這裡 */
const BOOK_CHIP = "去約顧問";
const BOOK_LATER = "先去約顧問";
const EXIT_CHIP: Record<Exclude<Offer, "none" | "booking">, string> = {
  upload: "好，我傳保險存摺", calc_ret: "幫我算算看", calc_tax: "幫我算算看", calc_edu: "幫我算算看",
};
const actionChips = (offer: Offer): string[] =>
  offer === "none" ? [] : offer === "booking" ? [BOOK_CHIP] : [EXIT_CHIP[offer], BOOK_LATER];

/** 出口要接到的地方：h_need 的下一步（健康：醫療趨勢卡 → 上傳；財務：年齡、資金態度 → 該子路線） */
const AFTER_CHAT = STEPS.findIndex(s => s.id === "h_need") + 1;
const EXIT_ROUTE: Record<Exclude<Offer, "none" | "booking">, Pick<FlowState, "branch" | "sub">> = {
  upload: { branch: "health", sub: null },
  calc_ret: { branch: "finance", sub: "ret" }, calc_tax: { branch: "finance", sub: "tax" }, calc_edu: { branch: "finance", sub: "edu" },
};

/** 自由對話裡 AI 的回覆（有 offer 欄位的那些） */
type ChatAi = Extract<store.MessageContent, { kind: "ai" }>;
const chatReplies = (msgs: store.StoredMessage[]): ChatAi[] =>
  msgs.flatMap(m => m.role === "assistant" && m.content.kind === "ai" && m.content.offer ? [m.content] : []);

/** 上一則 AI 自由對話回覆的邀約（中間隔了他的話就不算） */
function lastOffer(msgs: store.StoredMessage[]): Offer {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const c = msgs[i].content;
    if (msgs[i].role === "user") return "none";
    if (c.kind === "ai") return c.offer ?? "none";
  }
  return "none";
}

/**
 * 這一輪能不能邀約（4-au 第八節）：
 *   婉拒後 3 句不推；主動邀滿 3 次就不再主動邀
 *   急件：還沒邀過就一定要邀（最晚第 2 句——第 1 句 AI 沒邀，程式會補）
 *   一般人：第 5 句還沒邀過就一定要邀
 */
function inviteFor(msgs: store.StoredMessage[], urgentNow: boolean): Invite {
  const replies = chatReplies(msgs);
  const proactive = replies.filter(c => c.offer !== "none" && !c.byAsk);
  const lastAt = replies.map(c => c.offer !== "none").lastIndexOf(true);
  if (lastAt >= 0 && replies.length - 1 - lastAt < 3) return "not_now";
  if (proactive.length >= 3) return "not_now";
  if (proactive.length === 0 && (urgentNow || replies.some(c => c.urgent))) return "now";
  if (proactive.length === 0 && replies.length + 1 >= 5) return "now";
  return "ok";
}

/** 一輪：整理員記筆記 → 他答應出口就往下走；不然說話的人接話 */
async function needRound(userId: string, convId: string, st: FlowState, input: { option: number } | { text: string }) {
  const msgs = await store.getMessages(convId);
  const text = "option" in input ? chipsFor(msgs)[input.option] : input.text.trim().slice(0, 1000);
  if (!text) throw new Error("option" in input ? "沒有這個選項" : "請輸入內容");
  const offered = lastOffer(msgs);
  // 點了出口按鈕（好，我傳保險存摺／幫我算算看）：不用 AI，直接接到後段
  if ("option" in input && offered !== "none" && offered !== "booking" && text === EXIT_CHIP[offered]) {
    await store.addMessage(convId, "user", { kind: "user", text });
    await runForward(userId, convId, { ...st, ...EXIT_ROUTE[offered], cursor: AFTER_CHAT });
    return;
  }
  const history = historyOf(msgs);
  const { result: ex, usage } = await extractNeeds(history, st.values, text, await liveSlots());
  const userMsgId = await store.addMessage(convId, "user", { kind: "user", text }, { usage });
  // 打字答應（「好啊」「幫我算」）也一樣往下走
  if (ex.intent === "accept" && offered !== "none" && offered !== "booking") {
    const values = await applyNeedUpdates(userId, convId, st.values, ex, userMsgId, text);
    await runForward(userId, convId, { ...st, values, filled: new Set(values.keys()), ...EXIT_ROUTE[offered], cursor: AFTER_CHAT });
    return;
  }
  // 點選項＝回答上一句問的那一項。整理員沒記到的話就照選項記，不然會重問
  // （10/14 卡 A 回報：收入題點「兩個人差不多」連點 25 次都重問）
  const asked = lastAsk(msgs);
  if ("option" in input && asked && slotOf(asked) && !st.values.has(asked) && !ex.updates.some(u => u.slot === asked)) {
    ex.updates.push({ slot: asked, value: OPTION_DECLINE.test(text) ? DECLINED : text.slice(0, 20), confidence: "clear" });
  }
  const values = await applyNeedUpdates(userId, convId, st.values, ex, userMsgId, text, asked);
  const askedKeys = chatReplies(msgs).flatMap(c => c.ask ? [c.ask] : []);
  const invite = ex.intent === "book" ? "ok" : inviteFor(msgs, ex.urgent);
  const policy = hasPolicy(values);
  const r = await needTurn({ history: [...history, { role: "user", text }], known: values, askedBefore: askedBefore(values, askedKeys),
    hasPolicy: policy, invite, intent: ex.intent, userText: text });
  // 程式守住的線：他說要約一定給約顧問；沒保單不叫他傳；剛婉拒過不再推
  let offer = r.offer;
  if (ex.intent === "book") offer = "booking";
  else if (invite === "not_now") offer = "none";
  if (offer === "upload" && policy === "沒有") offer = "booking";
  await store.recordBlocks(convId, r.blocked, r.rewritten ? r.html : undefined);
  // 有邀約時，AI 自己寫的同類選項（「好，先算算看」「約顧問」）拿掉：點了不會走出口，又跟程式的按鈕重複（真 AI 測試 F21）
  const own = offer === "none" ? r.chips : r.chips.filter(c => !/算算|傳.*存摺|我傳|約顧問/.test(c));
  const chips = [...own, ...actionChips(offer)].filter((c, i, a) => a.indexOf(c) === i);
  await store.addMessage(convId, "assistant", {
    kind: "ai", html: r.html, chips, ...(r.asked ? { ask: r.asked } : {}), offer,
    ...(ex.intent === "book" ? { byAsk: true } : {}), ...(ex.urgent ? { urgent: true } : {}),
  }, { usage: sumUsage(r.usages), rewritten: r.rewritten });
  await store.saveState(userId, convId, { ...st, values, filled: new Set(values.keys()) }, false);
}

/** 整理員填的筆記寫進右欄，回傳更新後的值 */
const INCOME_WORDS = /賺|收入|薪|養家|一個人養|在養|錢|經濟|雙薪|主要|靠我|差不多/;
const OPTION_DECLINE = /不太想說|不想說|不想講|不方便|先不說/;

/** 上一句 AI 在問哪個筆記項目（跟著訊息存） */
function lastAsk(msgs: store.StoredMessage[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const c = msgs[i].content;
    if (msgs[i].role === "user") return undefined;
    if (c.kind === "ai") return c.ask;
  }
  return undefined;
}

async function applyNeedUpdates(userId: string, convId: string, known: Map<string, string>, ex: NeedExtraction, userMsgId: string, userText: string, asked?: string) {
  const values = new Map(known);
  for (const u of ex.updates) {
    const slot = slotOf(u.slot);
    if (!slot || slot.legacy) continue;
    // 收入只收他自己講到錢的（指令寫了不准推論，整理員還是偶爾從「老婆跟小孩」推出「主要收入」）；拒答照收
    // 正在問收入時他回的話就是答案，不用這道檢查
    if (slot.key === "income_share" && asked !== "income_share" && u.value !== DECLINED && !INCOME_WORDS.test(userText)) continue;
    values.set(slot.key, u.value);
    await store.upsertFact(convId, userId, { key: slot.key, display: u.value, number: null,
      bucket: slot.values.includes(u.value) ? u.value : null, health: slot.health, confidence: u.confidence, sourceMessageId: userMsgId });
  }
  return values;
}

/** 題目前面最後一句 AI 台詞＝這一題實際問的話（用後台發布版） */
function lastQuestion(cursor: number, lc: Awaited<ReturnType<typeof liveContent>>): string {
  for (let i = cursor - 1; i >= 0; i--) {
    const s = liveStep(lc, STEPS[i]);
    if (s.t === "ai") return s.h.replace(/<[^>]+>/g, "");
    if (s.t === "ask") break;
  }
  return "";
}

/**
 * 右欄點開修改（I5）。只能改成該題的某個選項、或填數字；改完標成「使用者確認過」。
 * 決定分支的題目（來意、最在意哪一塊）不能從這裡改——改了等於換一條路，要開新對話。
 */
export async function editFact(userId: string, convId: string, key: string, change: { option: number } | { number: number; display: string }): Promise<Snapshot> {
  const conv = await store.getConversation(userId, convId);
  if (!conv) throw new Error("找不到這段對話");
  const before = (await store.getFacts(convId)).find(f => f.key === key);
  const slot = slotOf(key);
  if (slot) {
    if (!slot.editable) throw new Error("這一項決定了聊天的方向，要改的話請開一個新的對話");
    const v = "option" in change ? slot.values[change.option] : undefined;
    if (!v) throw new Error("沒有這個選項");
    await store.upsertFact(convId, userId, { key, display: v, number: null, bucket: slot.health ? null : v, health: slot.health, confidence: "confirmed" });
    await store.addMessage(convId, "assistant", { kind: "note", text: `已更新：${before?.display ?? ""} → ${v}` });
    await store.saveState(userId, convId, await store.loadState(conv), conv.status === "done");
    return snapshot(userId, convId);
  }
  const ask = STEPS.find(s => s.t === "ask" && s.keys.includes(key));
  if (!ask || ask.t !== "ask") throw new Error("這一項不能修改");
  if (ask.o.some(o => o.r || o.f)) throw new Error("這一項決定了聊天的方向，要改的話請開一個新的對話");
  let a: Answer;
  if ("option" in change) {
    const opt = ask.o[change.option];
    if (!opt || opt.key !== key) throw new Error("沒有這個選項");
    a = answerFromOption(ask, opt);
  } else {
    const near = nearestOption(ask, change.number);
    if (!near) throw new Error("這一項不能填數字");
    a = answerFromOption(ask, near);
    a.fact = { ...a.fact!, number: change.number, display: change.display };
  }
  await store.upsertFact(convId, userId, { ...a.fact!, confidence: "confirmed" });
  await store.addMessage(convId, "assistant", { kind: "note", text: `已更新：${before?.display ?? ""} → ${a.fact!.display}` });
  await store.saveState(userId, convId, await store.loadState(conv), conv.status === "done");
  return snapshot(userId, convId);
}
