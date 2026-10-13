import { STEPS, TRENDS, type Option, type Step } from "./script";
import { needsReady, nextSlot } from "./needs";

/*
 * 對話引擎的確定性部分（實作設計 I1）：照骨架往下走，不呼叫 AI。
 *   ・跳過不屬於目前分支／子路線的步驟
 *   ・已經有值的題目不再問（4-y：接續舊對話不重講）
 *   ・遇到 ask 停下來等使用者；遇到 up 停下來等上傳
 *   ・遇到 need（4-ai）：需求點還沒齊就停下來，問哪一點由 needs.ts 決定、怎麼問由 AI 決定
 * 所有「下一步是什麼」都在這裡決定，AI 永遠只能在這個框架裡說話。
 */

export type AskStep = Extract<Step, { t: "ask" }>;

export interface FlowState {
  cursor: number;                       // 下一個要處理的步驟索引
  branch: "health" | "finance" | null;
  sub: "ret" | "tax" | "edu" | null;
  filled: Set<string>;                  // 已經有值的需求點 key
  values: Map<string, string>;          // 需求點的值（need 步驟要靠值判斷條件題）
}

export type FlowEvent =
  | { type: "ai"; html: string; stepId: string }
  | { type: "trend"; title: string; body: string; forYou: string; stepId: string }
  | { type: "panel"; key: string; stepId: string }
  | { type: "phase"; index: number }
  | { type: "highlight"; key: string };

export interface Pending {
  kind: "ask" | "upload" | "done";
  ask?: { stepId: string; keys: string[]; options: string[] };
  uploadStepId?: string;
}

const applies = (s: Step, st: FlowState) =>
  (!s.br || s.br === st.branch) && (!s.sub || s.sub === st.sub) &&
  !("skipIfSub" in s && s.skipIfSub && st.sub);      // 子路線已經由「最擔心」決定，不再問從哪一塊開始

/** 從 cursor 往下走，收集要顯示的事件，直到需要使用者動作為止。不改動傳入的 state。 */
export function advance(state: FlowState): { events: FlowEvent[]; pending: Pending; cursor: number } {
  const events: FlowEvent[] = [];
  let i = state.cursor;
  for (; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (!applies(s, state)) continue;
    switch (s.t) {
      case "ai": events.push({ type: "ai", html: s.h, stepId: s.id }); break;
      case "trd": {
        const t = TRENDS[String(s.k)];
        if (t) events.push({ type: "trend", title: t[0], body: t[1], forYou: t[2], stepId: s.id });
        break;
      }
      case "panel": events.push({ type: "panel", key: String(s.k), stepId: s.id }); break;
      case "ph": events.push({ type: "phase", index: Number(s.k) }); break;
      case "hl": events.push({ type: "highlight", key: String(s.k) }); break;
      case "up": return { events, pending: { kind: "upload", uploadStepId: s.id }, cursor: i };
      case "need": {
        if (needsReady(state.values)) continue;
        const slot = nextSlot(state.values);
        if (!slot) continue;
        // 選項由 AI 每輪產生、存在上一則 AI 訊息上；service.snapshot 會補進來
        return { events, pending: { kind: "ask", ask: { stepId: s.id, keys: [slot.key], options: [] } }, cursor: i };
      }
      case "ask":
        if (s.keys.some(k => state.filled.has(k))) continue;   // 已經答過，不重問
        return {
          events,
          pending: { kind: "ask", ask: { stepId: s.id, keys: s.keys, options: s.o.map(o => o.x) } },
          cursor: i,
        };
    }
  }
  return { events, pending: { kind: "done" }, cursor: i };
}

export function stepAt(cursor: number): Step | undefined {
  return STEPS[cursor];
}

export function askAt(cursor: number): AskStep | null {
  const s = STEPS[cursor];
  return s && s.t === "ask" ? s : null;
}

/** 一個回答造成的變化：要存的需求點、分支切換 */
export interface Answer {
  fact?: { key: string; display: string; number: number | null; bucket: string | null; health: boolean };
  branch?: "health" | "finance";
  sub?: "ret" | "tax" | "edu";
}

/** 使用者點了選項：值是確定的，不需要 AI */
export function answerFromOption(ask: AskStep, opt: Option): Answer {
  const a: Answer = {};
  if (opt.r) a.branch = opt.r;
  if (opt.f) a.sub = opt.f;
  if (opt.key) {
    a.fact = {
      key: opt.key,
      display: opt.v ?? opt.x,
      number: opt.n ?? null,
      // 選項本身就是粗略級距；健康類一律不存（D2）
      bucket: opt.health ? null : (opt.v ?? opt.x),
      health: !!opt.health,
    };
  }
  return a;
}

/**
 * 自由輸入抽出數字時，用最接近的選項當統計級距與分支依據（不含個資的粗略分組）。
 * 沒有數字的題目回傳 null。
 */
export function nearestOption(ask: AskStep, value: number): Option | null {
  const withN = ask.o.filter(o => typeof o.n === "number");
  if (withN.length === 0) return null;
  return withN.reduce((best, o) => (Math.abs(o.n! - value) < Math.abs(best.n! - value) ? o : best));
}

export function applyAnswer(state: FlowState, a: Answer): FlowState {
  const filled = new Set(state.filled);
  const values = new Map(state.values);
  if (a.fact) { filled.add(a.fact.key); values.set(a.fact.key, a.fact.display); }
  return {
    cursor: state.cursor + 1,
    branch: a.branch ?? state.branch,
    sub: a.sub ?? state.sub,
    filled,
    values,
  };
}

/** 上傳步驟完成（或暫時跳過）後往下走 */
export function passUpload(state: FlowState): FlowState {
  return { ...state, cursor: state.cursor + 1 };
}
