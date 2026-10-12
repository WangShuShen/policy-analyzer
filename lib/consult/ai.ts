import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { checkCompliance, SAFE_REPLY } from "./compliance";
import type { AskStep } from "./engine";

/*
 * 對話引擎的 AI 部分（實作設計 I1、I4、I5）。只有使用者「打字」時才會呼叫；點選項完全不花錢。
 *   ・抽取：Claude Haiku 5.5（顧問 2026-10-11 指定）——把自由輸入對到選項或抽出數字
 *   ・說話：Claude Opus 5.5（顧問 2026-10-11 指定）——回應一句、或簡短回答岔題，再拉回題目
 * 數字一律不給 AI 算；AI 也決定不了下一題問什麼（那是 engine.ts 的事）。
 */
const CHAT_MODEL = "claude-opus-5-5";
const EXTRACT_MODEL = "claude-haiku-5-5";

// 每百萬 token 的美元價格 → 每 token 的 micro-USD（I6 觀察期用量紀錄）
const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  [CHAT_MODEL]: { in: 4, out: 20, cacheRead: 0.2 },
  [EXTRACT_MODEL]: { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

export interface Usage { model: string; tokensIn: number; tokensOut: number; costMicroUsd: number }

function usageOf(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Usage {
  const p = PRICE[model] ?? PRICE[CHAT_MODEL];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost = u.input_tokens * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.out;
  return { model, tokensIn: u.input_tokens + cacheRead + cacheWrite, tokensOut: u.output_tokens, costMicroUsd: Math.ceil(cost) };
}

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

// ── 抽取 ──────────────────────────────────────────────────────────

const ExtractSchema = z.object({
  kind: z.enum(["answer", "question", "unclear"]),
  option_index: z.number().int().nullable(),
  value_number: z.number().nullable(),
  display: z.string().nullable(),
  confidence: z.enum(["clear", "estimated"]),
});
export type Extraction = z.infer<typeof ExtractSchema>;

const EXTRACT_SYSTEM = `你是保險需求訪談的資料整理員。使用者剛回答了一個問題，請判斷他的回答並結構化。

規則：
- kind：回答了這題 → "answer"；反過來問了一個保險知識問題 → "question"；看不出在回答什麼 → "unclear"
- 若回答明顯對應某個選項，option_index 填該選項的索引（從 0 開始），否則填 null
- 若問題有數值（選項帶 n），且使用者講了具體數字，value_number 填換算後的數字（單位同選項的 n，例如「兩萬」→ 20000、「三十幾歲」→ 35），display 用跟選項 v 相同的寫法（例如「約 2 萬／月」）
- 回答模糊、是範圍或自己猜的（「兩三萬吧」「差不多」「大概」）→ confidence "estimated"，數字取中間值；明確的 → "clear"
- 只整理使用者講的內容，不推論、不補充、不評論`;

export async function extractAnswer(ask: AskStep, question: string, text: string): Promise<{ result: Extraction; usage: Usage }> {
  const options = ask.o.map((o, i) => `${i}. ${o.x}${o.v ? `（記為：${o.v}）` : ""}${o.n !== undefined ? `（n=${o.n}）` : ""}`).join("\n");
  const res = await client().messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: EXTRACT_SYSTEM,
    output_config: { format: zodOutputFormat(ExtractSchema) },
    messages: [{ role: "user", content: `問題：${question}\n選項：\n${options}\n\n使用者回答：${text}` }],
  });
  const usage = usageOf(EXTRACT_MODEL, res.usage);
  const parsed = res.parsed_output;
  if (!parsed) return { result: { kind: "unclear", option_index: null, value_number: null, display: null, confidence: "estimated" }, usage };
  if (parsed.option_index !== null && (parsed.option_index < 0 || parsed.option_index >= ask.o.length)) parsed.option_index = null;
  return { result: parsed, usage };
}

// ── 說話 ──────────────────────────────────────────────────────────

/*
 * 系統提示固定不變（放最前面才吃得到 prompt cache）。每輪變動的內容放在 messages 裡。
 * N1 的三條界線寫在這裡，同時還有規則層攔截（compliance.ts）——提示詞會破功，所以不能只靠它。
 */
const CHAT_SYSTEM = `你是 RADIA 的 AI 諮詢小幫手，正在跟一位民眾聊他的保險需求。你的角色是「聽懂他、整理他的狀況」，不是賣保險。

說話方式：
- 繁體中文，像朋友聊天，親切、有溫度、不說教。用「你」不用「您」
- 很短：一到兩句，最多 60 個字。不要條列、不要標題
- 可以用 <b>粗體</b> 強調一個重點，不要用其他標記

絕對不能做的事（法規界線，違反會影響整個組織的登錄資格）：
1. 不解釋任何保險商品的內容，不提任何保險公司或商品名稱
2. 不建議任何保額、金額，不說「你應該買多少」
3. 不比較任何條款或商品好壞
遇到這類問題，就說這要看條款與他的實際狀況，面談時由登錄的顧問當面說明。

你可以做的事：一般保險知識的衛教（例如實支實付與日額型的差別、重大傷病卡是什麼）、回應他的感受、把話題帶回目前這一題。
你不決定下一題問什麼，也不計算任何數字——那些由系統處理。你只負責講這一兩句話。`;

export type ReplyMode =
  | { kind: "bridge"; question: string; userText: string; recorded: string; estimated: boolean }   // 回答了題目
  | { kind: "answer_question"; question: string; userText: string }                               // 岔題問知識
  | { kind: "clarify"; question: string; userText: string; options: string[] };                   // 聽不懂

function instruction(m: ReplyMode): string {
  switch (m.kind) {
    case "bridge":
      return `剛剛的問題：「${m.question}」\n他回答：「${m.userText}」\n系統記下：「${m.recorded}」\n請用一句話自然地回應他說的內容（表示你聽懂了、或回應他的感受）。不要重複問題，不要問下一題，下一題系統會接著問。`;
    case "answer_question":
      return `目前正在問：「${m.question}」\n他反問了：「${m.userText}」\n請用兩句內簡短回答（只能是一般衛教知識，碰到商品、保額、條款比較就說面談時由顧問說明），最後一句把話題自然帶回目前這一題。`;
    case "clarify":
      return `目前正在問：「${m.question}」\n可選的回答：${m.options.join("／")}\n他回答：「${m.userText}」，看不太出來是哪一種。請用一句話溫和地請他再說清楚一點，或從選項挑一個。`;
  }
}

async function callChat(content: string, extraSystem?: string) {
  const res = await client().beta.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",                     // 被安全機制擋下時，伺服器端自動改由備援模型接手
    output_config: { effort: "low" },         // Opus 5.5 不能關 thinking，聊天用 low 就夠
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content },
      ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
    ],
  });
  const text = res.stop_reason === "refusal" ? "" :
    res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map(b => b.text).join("").trim();
  return { text, usage: usageOf(res.model ?? CHAT_MODEL, res.usage) };
}

export interface ReplyResult {
  html: string;
  usages: Usage[];
  blocked: { reason: string; original: string; attempt: number }[];   // 被合規層攔下的原句（寫進 compliance_blocks）
  rewritten: boolean;
}

/** 產生 AI 這一句話，並過合規規則層；被攔就重產一次，再被攔就改送安全回覆（I4） */
export async function reply(mode: ReplyMode): Promise<ReplyResult> {
  const usages: Usage[] = [];
  const blocked: ReplyResult["blocked"] = [];
  const content = instruction(mode);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const extra = attempt === 2
      ? `上一個版本違反了界線（${blocked[0]?.reason}）。這次完全不要提任何金額、公司、商品或條款內容。`
      : undefined;
    const { text, usage } = await callChat(content, extra);
    usages.push(usage);
    if (!text) { blocked.push({ reason: "模型拒答", original: "", attempt }); continue; }
    const c = checkCompliance(text);
    if (c.ok) return { html: text, usages, blocked, rewritten: attempt > 1 };
    blocked.push({ reason: c.reason!, original: text, attempt });
  }
  return { html: SAFE_REPLY, usages, blocked, rewritten: true };
}

/** 模糊值的複述（I5）：「我先記 2.5 萬，不對你再跟我說」——固定句型，不用 AI */
export const confirmLine = (display: string) => `我先記成「<b>${display}</b>」，不對的話右邊點一下就能改。`;

// ── 衛教模式（沒同意個資蒐集；一個字都不記，4-z、N22）──────────────────

const EDU_SYSTEM = `你是 RADIA 的 AI 小幫手，現在是「衛教模式」：這位民眾選擇不提供個人資料，所以你只回答一般保險知識，而且這段對話不會被記錄。

說話方式：繁體中文、像朋友聊天、親切不說教，用「你」。三句以內，最多 120 個字。可以用 <b>粗體</b> 強調一個重點。

絕對不能做的事（法規界線）：
1. 不解釋任何保險商品的內容，不提任何保險公司或商品名稱
2. 不建議任何保額、金額
3. 不比較任何條款或商品好壞

另外：不要問他的個人狀況（年齡、收入、健康、保單內容）。如果他主動講了，溫和提醒「衛教模式不會記下這些，想看你自己的保障夠不夠，需要先同意個資告知書」。`;

export async function eduReply(history: { role: "user" | "assistant"; text: string }[], text: string): Promise<{ html: string; blocked: boolean }> {
  const msgs: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-6).map(h => ({ role: h.role, content: h.text })),
    { role: "user", content: text },
  ];
  // 對話必須從 user 開始
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const res = await client().beta.messages.create({
    model: CHAT_MODEL, max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: EDU_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: msgs,
  });
  const out = res.stop_reason === "refusal" ? "" :
    res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map(b => b.text).join("").trim();
  if (!out || !checkCompliance(out).ok) return { html: SAFE_REPLY, blocked: true };
  return { html: out, blocked: false };
}
