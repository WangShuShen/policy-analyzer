import { advance, askAt, answerFromOption, applyAnswer, nearestOption, passUpload, stepAt,
  type Answer, type FlowEvent, type FlowState, type Pending } from "./engine";
import { STEPS } from "./script";
import { extractAnswer, reply, confirmLine, type Usage } from "./ai";
import * as store from "./store";
import { buildAnalysis, publicView, saveSnapshotIfChanged, type AnalysisView } from "./analysis";
import { view as passbookView } from "@/lib/passbook/service";

/*
 * 一輪對話（實作設計 I1）：
 *   點選項 → 值是確定的，不呼叫 AI
 *   打字   → Haiku 抽取 → 對到答案就記下、Opus 回一句 → 引擎接著往下走
 *            岔題問知識 → Opus 簡短回答並拉回 → 停在同一題
 *            聽不懂     → Opus 請他再說一次 → 停在同一題
 */

export interface Snapshot {
  conversation: { id: string; title: string; status: string; branch: string | null; sub: string | null };
  messages: store.StoredMessage[];
  facts: (store.StoredFact & { label: string; options: { index: number; label: string }[] | null })[];
  pending: Pending;
  analysis: AnalysisView;          // 右欄計算區塊（鎖住的內容不在裡面）
  phase: number;                   // 原型上方三階段：0 聊出需求｜1 看現況｜2 補強建議
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

const pendingAt = (st: FlowState): Pending => advance({ ...st }).pending;

/** 把引擎吐出的事件存成訊息；phase／highlight 只是畫面效果，不存 */
async function persistEvents(convId: string, events: FlowEvent[]): Promise<void> {
  for (const e of events) {
    if (e.type === "ai") await store.addMessage(convId, "assistant", { kind: "ai", html: e.html }, { stepId: e.stepId });
    else if (e.type === "trend") await store.addMessage(convId, "assistant", { kind: "trend", title: e.title, body: e.body, forYou: e.forYou }, { stepId: e.stepId });
    else if (e.type === "panel") await store.addMessage(convId, "assistant", { kind: "panel", key: e.key }, { stepId: e.stepId });
  }
}

/** 往下走到下一個需要使用者的地方，存事件與進度 */
async function runForward(userId: string, convId: string, st: FlowState): Promise<FlowState> {
  const r = advance(st);
  await persistEvents(convId, r.events);
  const next = { ...st, cursor: r.cursor };
  await store.saveState(userId, convId, next, r.pending.kind === "done");
  return next;
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
    pending: pendingAt(st),
    analysis: publicView(analysis),
    phase: phaseAt({ ...st, cursor: advance({ ...st }).cursor }),
  };
}

/** 開新對話，或打開既有的（4-x：舊對話是「聊到一半」，不是封存檔） */
export async function open(userId: string, convId?: string | null): Promise<Snapshot> {
  if (convId) {
    const conv = await store.getConversation(userId, convId);
    if (!conv) throw new Error("找不到這段對話");
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

  if ("skipUpload" in input || "uploaded" in input) {
    if (cur.t !== "up") throw new StaleTurnError();
    // 上傳了 → 解析在背景跑，對話照常往下（P2）；跳過 → 面談前再傳也來得及
    await store.addMessage(convId, "assistant", "uploaded" in input
      ? { kind: "note", text: "📎 收到你的存摺了——我邊看邊跟你聊，讀好會出現在右邊" }
      : { kind: "note", text: "📎 保險存摺之後再傳也可以——面談前傳都來得及" });
    await runForward(userId, convId, passUpload(st));
    return snapshot(userId, convId);
  }

  const ask = askAt(st.cursor);
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
  const question = lastQuestion(st.cursor);
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
    if (answer.fact) await store.upsertFact(convId, userId, { ...answer.fact, confidence: estimated ? "estimated" : "clear", sourceMessageId: userMsgId });
    await saveReply(convId, r.html, r.usages, r.rewritten);
    if (estimated && answer.fact) await store.addMessage(convId, "assistant", { kind: "ai", html: confirmLine(answer.fact.display) });
    await runForward(userId, convId, applyAnswer(st, answer));
  } else {
    const mode = ex.kind === "question"
      ? { kind: "answer_question" as const, question, userText: text }
      : { kind: "clarify" as const, question, userText: text, options: ask.o.map(o => o.x) };
    const r = await reply(mode);
    await store.recordBlocks(convId, r.blocked, r.rewritten ? r.html : undefined);
    await saveReply(convId, r.html, r.usages, r.rewritten);
    await store.saveState(userId, convId, st, false);   // 停在同一題，但更新最後互動時間
  }
  return snapshot(userId, convId);
}

async function saveReply(convId: string, html: string, usages: Usage[], rewritten: boolean) {
  // 一句話可能重產過（合規攔截），用量加總記在這則訊息上（I6）
  const total = usages.reduce<Usage>((a, u) => ({ model: u.model, tokensIn: a.tokensIn + u.tokensIn, tokensOut: a.tokensOut + u.tokensOut, costMicroUsd: a.costMicroUsd + u.costMicroUsd }),
    { model: usages[0]?.model ?? "", tokensIn: 0, tokensOut: 0, costMicroUsd: 0 });
  await store.addMessage(convId, "assistant", { kind: "ai", html }, { usage: total, rewritten });
}

/** 題目前面最後一句 AI 台詞＝這一題實際問的話 */
function lastQuestion(cursor: number): string {
  for (let i = cursor - 1; i >= 0; i--) {
    const s = STEPS[i];
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
  const ask = STEPS.find(s => s.t === "ask" && s.keys.includes(key));
  if (!ask || ask.t !== "ask") throw new Error("這一項不能修改");
  if (ask.o.some(o => o.r || o.f)) throw new Error("這一項決定了聊天的方向，要改的話請開一個新的對話");
  const before = (await store.getFacts(convId)).find(f => f.key === key);
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
