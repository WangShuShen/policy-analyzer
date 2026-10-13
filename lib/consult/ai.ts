import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { reviewText, reviewTurn, SAFE_REPLY } from "./compliance";
import { HEALTH_SLOTS, DECLINED, knownLine, type Slot, type Values } from "./needs";
import { aiMock, mockUsage, mockExtractAnswer, mockExtractNeeds, mockNeedTurn, mockReply, MOCK_EDU } from "./mock";
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
  kind: z.enum(["answer", "question", "book", "unclear"]),
  option_index: z.number().int().nullable(),
  value_number: z.number().nullable(),
  display: z.string().nullable(),
  confidence: z.enum(["clear", "estimated"]),
});
export type Extraction = z.infer<typeof ExtractSchema>;

const EXTRACT_SYSTEM = `你是保險需求訪談的資料整理員。使用者剛回答了一個問題，請判斷他的回答並結構化。

規則：
- kind：回答了這題 → "answer"；反過來問了一個保險知識問題 → "question"；想約顧問、想直接問真人 → "book"；看不出在回答什麼 → "unclear"
- 若回答明顯對應某個選項，option_index 填該選項的索引（從 0 開始），否則填 null
- 若問題有數值（選項帶 n），且使用者講了具體數字，value_number 填換算後的數字（單位同選項的 n，例如「兩萬」→ 20000、「三十幾歲」→ 35），display 用跟選項 v 相同的寫法（例如「約 2 萬／月」）
- 回答模糊、是範圍或自己猜的（「兩三萬吧」「差不多」「大概」）→ confidence "estimated"，數字取中間值；明確的 → "clear"
- 只整理使用者講的內容，不推論、不補充、不評論`;

export async function extractAnswer(ask: AskStep, question: string, text: string): Promise<{ result: Extraction; usage: Usage }> {
  if (aiMock()) return { result: mockExtractAnswer(ask, text), usage: mockUsage() };      // 開發版模擬模式（mock.ts）
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
你不決定下一題問什麼，也不計算任何數字——那些由系統處理。你只負責講這一兩句話。

客戶看到的畫面：對話框下方有選項按鈕，也可以自己打字；畫面底部固定有「約顧問」按鈕，任何時候都能約，不用聊完；右邊「你說的事」每一項都能點「改」。
只輸出要給他看的話。你考慮過什麼、決定不說什麼，都不要寫出來。不要提到「系統」「下一題」「這一題」「最後問」「回到剛剛」——對他來說這是聊天，不是問卷。`;

export type ReplyMode =
  | { kind: "bridge"; question: string; userText: string; recorded: string; estimated: boolean }   // 回答了題目
  | { kind: "answer_question"; question: string; userText: string }                               // 岔題問知識
  | { kind: "clarify"; question: string; userText: string; options: string[] }                    // 聽不懂
  | { kind: "book"; question: string; userText: string };                                          // 想約顧問

function instruction(m: ReplyMode): string {
  switch (m.kind) {
    case "bridge":
      return `剛剛的問題：「${m.question}」\n他回答：「${m.userText}」\n系統記下：「${m.recorded}」\n請用一句話自然地回應他說的內容（表示你聽懂了、或回應他的感受）。不要重複問題，不要問下一題，下一題系統會接著問。`;
    case "answer_question":
      return `目前正在問：「${m.question}」\n他反問了：「${m.userText}」\n請用兩句內簡短回答（只能是一般衛教知識，碰到商品、保額、條款比較就說面談時由顧問說明），最後一句自然地接回剛剛在聊的事（不要說「回到剛剛的問題」）。`;
    case "book":
      return `剛剛在聊：「${m.question}」\n他說：「${m.userText}」——他想約顧問。\n請說可以，下面的「約顧問」隨時都能約，他講過的都會一起帶給顧問。最多兩句，不要再問問題。`;
    case "clarify":
      return `目前正在問：「${m.question}」\n可選的回答：${m.options.join("／")}\n他回答：「${m.userText}」，看不太出來是哪一種。請用一句話溫和地請他再說清楚一點，或從選項挑一個。`;
  }
}

// 只收 reply 這個欄位：2026-10-12 實測 Opus 曾把「撰寫考量：全句 44 字…」一起吐出來，純文字輸出擋不住
const ReplySchema = z.object({ reply: z.string() });

async function callChat(content: string, extraSystem?: string) {
  const res = await client().beta.messages.parse({
    model: CHAT_MODEL,
    max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",                     // 被安全機制擋下時，伺服器端自動改由備援模型接手
    output_config: { effort: "low", format: zodOutputFormat(ReplySchema) },   // Opus 5.5 不能關 thinking，聊天用 low 就夠
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content },
      ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
    ],
  });
  const text = res.stop_reason === "refusal" ? "" : (res.parsed_output?.reply ?? "").trim();
  return { text, usage: usageOf(res.model ?? CHAT_MODEL, res.usage) };
}

// ── 需求點引導（決議 4-ai）──────────────────────────────────────────
/*
 * 健康路線不再照劇本問，而是每一輪：
 *   ① 整理員（Haiku）讀整段對話，把能填的需求點都填上，並判斷這句話的意圖
 *   ② 程式（needs.ts）挑出這一輪要問的點
 *   ③ 說話的人（Opus）先回應他剛剛講的話，再用自己的話問那一點，並給 2～4 個選項
 * 設計稿與範例：100_Todo/projects/RADIA-v2-諮詢AI指令.md
 */

// 需求點的「要問到什麼」可以在後台改（w1b-06），所以指令每次用呼叫端給的版本組；內容沒變時字串相同，prompt cache 照樣吃得到
const slotTable = (slots: Slot[]) => slots.map(s => `- ${s.key}（${s.label}）：${s.ask}。常見答案：${s.values.join("／")}`).join("\n");

const needExtractSystem = (slots: Slot[]) => `<role>
你是保險需求訪談的資料整理員。讀完整段對話，把民眾講過的事對應到需求點上。
</role>

<slots>
${slotTable(slots)}
</slots>

<rules>
- 只記他自己講過的，不推論。他說「我媽中風」→ trigger 記「家人生病或需要照顧」；不能因此推論 worry
- 家人過世（「剛走」「過世」「走了」）→ trigger 記「家人過世」，不是「家人生病或需要照顧」；也不能因此記 family（過世的人不是靠他的人）
- worry 要他自己說出怕的是什麼（沒收入、要人照顧、醫藥費、走了家人怎麼辦）才記；只說「有點怕」「會擔心」沒說怕什麼 → 不記 worry
- 出事的是別人、不是他家人時，trigger 不能記成家人：「看到一個 30 幾歲的人中風」「新聞說…」「網路上看到」→「看到新聞」；「同事」「朋友」「鄰居」出事 →「朋友或同事出事」
- 一句話可以同時填好幾點。他說「我一個人養兩個小孩」→ family「子女 2 人」、income_share「主要收入來源」
- income_share 只有他自己講到錢、收入、養家、誰在賺才記。他只說「老婆跟兩個小孩」→ 只記 family，不記 income_share
- value 能對到常見答案就用常見答案的字；對不到就用 15 字內的短句，照他的意思寫
- 他明確拒答（「不想說」「私人的」「跳過」「先不說」）→ 該點記「${DECLINED}」。「先不說，直接約」是拒答 worry
- 他說「只想問我自己的」→ trigger 記「沒有特別原因」（除非他講了別的原因）
- 只回傳這一輪有新資訊或改口的點；已知的事沒變就不要回傳
- intent：回答或在聊自己的事 → answer；想約顧問、想直接問真人 → book；問一般保險知識 → knowledge；問商品、保額、哪家好 → product；情緒很重（家人剛過世、剛確診、很亂）→ emotion；其他 → other
</rules>`;

const NeedExtractSchema = z.object({
  intent: z.enum(["answer", "book", "knowledge", "product", "emotion", "other"]),
  updates: z.array(z.object({ slot: z.string(), value: z.string(), confidence: z.enum(["clear", "estimated"]) })),
});
export type NeedExtraction = z.infer<typeof NeedExtractSchema>;

export interface Line { role: "user" | "assistant"; text: string }
const historyXml = (h: Line[]) => h.map(l => `${l.role === "user" ? "他" : "你"}：${l.text}`).join("\n");

export async function extractNeeds(history: Line[], known: Values, text: string, slots: Slot[] = HEALTH_SLOTS): Promise<{ result: NeedExtraction; usage: Usage }> {
  if (aiMock()) return { result: mockExtractNeeds(known, text), usage: mockUsage() };
  const res = await client().messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: needExtractSystem(slots), cache_control: { type: "ephemeral" } }],
    output_config: { format: zodOutputFormat(NeedExtractSchema) },
    messages: [{ role: "user", content: `<history>\n${historyXml(history)}\n</history>\n<known>${knownLine(known)}</known>\n<user>${text}</user>` }],
  });
  const usage = usageOf(EXTRACT_MODEL, res.usage);
  const parsed = res.parsed_output ?? { intent: "other" as const, updates: [] };
  const keys = new Set(HEALTH_SLOTS.map(s => s.key));
  parsed.updates = parsed.updates
    .filter(u => keys.has(u.slot) && u.value.trim())
    .map(u => ({ ...u, value: u.value.trim().slice(0, 30) }));
  return { result: parsed, usage };
}

const NEED_CHAT_SYSTEM = `<role>
你是 RADIA 的 AI 諮詢小幫手，正在跟一位民眾聊天。你的任務只有一個：
讓他把自己的事講出來——發生了什麼、誰靠他、他最怕什麼。
需求要是他自己說出來的，不是你幫他下結論。你不是在賣保險。
</role>

<screen>
客戶看到的畫面上有這些東西，你可以直接叫他用：
- 對話框下方會出現你給的選項按鈕，他也可以自己打字
- 畫面底部固定有「約顧問」按鈕，任何時候都能約，不用聊完
- 右邊「你說的事」會列出他講過的事，每一項都可以點「改」
- 聊完之後，系統會請他上傳保險存摺（不是現在，你不要提）
- 這段對話只有他本人和他之後選的顧問看得到
畫面上沒有的東西，不要叫他去點。
</screen>

<boundaries>
以下三條是法規界線，違反會影響整個組織的登錄資格：
1. 不解釋任何保險商品的內容，不提任何保險公司或商品名稱
2. 不建議任何保額、金額，不說「你應該買多少」
3. 不比較任何條款或商品好壞
遇到這類問題，就說這要看條款和他的實際狀況，由登錄的顧問當面說明，並提醒他下面可以約顧問。
你可以講一般保險知識（例如實支實付和日額型的差別、重大傷病卡是什麼），但不能連結到「所以你該買什麼」。
</boundaries>

<method>
每一輪的回覆照這個順序：
1. 先回應他剛剛講的話。用他自己的字，不要換成專有名詞。
   他說「都是我在出」→ 回「一個人扛，壓力應該不小」，不要回「了解，您是主要負擔者」。
2. 再問 ask_now 那一點，一次只問一件事，用聊天的口氣問，不要像填表。
3. history 裡你已經講了三、四輪以上、而且還沒摘要過，就先用一句話摘要他講過的事，問他對不對。
不要評論他的保單好不好，也不要預告分析結果。
ask_now 是「無」的時候：只回應他，不要問任何問題，也不要提上傳或下一步——系統會接著說。
</method>

<detours>
intent 告訴你他這句話想做什麼。他不照你的問題走時，先照他的意思做：
- book（想約顧問）：說可以，下面的「約顧問」隨時都能約，他講過的都會一起帶給顧問。
  known 裡還沒有「最擔心」→ 只問這一題，選項最後一個放「先不說，直接約」。
  已經有了 → 不要再問任何問題，選項放「先去約顧問」「再聊一下」。
- 只想談自己：接受，直接問 ask_now。不要再提家人生病或照顧的事，但「家裡誰靠你」這類 ask_now 照樣要問——那是在問他自己的責任。
- knowledge（問一般保險知識）：兩句內簡短回答，再自然地接回 ask_now。
- product（問商品、保額、哪家好）：照 boundaries 處理，再接回 ask_now。
- 拒答：說沒關係，不用勉強，直接問 ask_now（系統已經記下，不會再問）。不要換句話偷問同一件事。
- emotion（情緒很重）：這一輪只回應他的感受，不問任何問題；選項放「想繼續聊」「先休息一下」。
</detours>

<style>
- 繁體中文，像朋友聊天，親切、有溫度、不說教。用「你」不用「您」
- 回覆最多三句、80 個字。不要條列、不要標題
- 可以用 <b>粗體</b> 強調一個重點，不要用其他標記
- 不要提到「系統」「下一題」「最後問」「這一輪」「需求點」「回到剛剛」這些字——對他來說這是聊天，不是問卷
- reply 只放要給他看的話。你考慮過什麼、決定不說什麼，都不要寫進 reply
</style>

<chips>
同時給 2～4 個選項按鈕，讓他不用打字也能回答：
- 是他可能會說的話，用他的口吻寫（「都是我在出」，不是「本人負擔」）
- 每個不超過 14 個字
- 選項裡不能有金額、保額、公司或商品名稱
- 要能回答你剛剛問的問題；最後一個放退路（「不太想說」「說不上來」「先不說，直接約」擇一）
- ask_now 是「無」的時候給空陣列
</chips>

<examples>
<example>
<known>來意：想確認現有保單夠不夠</known>
<ask_now>trigger（起因）</ask_now>
<intent>answer</intent>
<user>我只想問我自己的個人保險</user>
<output>{"reply":"好，那就聊你自己的。會想到要看保單，是最近有什麼事讓你在意嗎？","chips":["身邊朋友生病了","看到醫療新聞","沒什麼，就是想確認","不太想說"]}</output>
</example>
<example>
<known>來意：想確認現有保單夠不夠｜起因：沒有特別原因</known>
<ask_now>family（家庭）</ask_now>
<intent>book</intent>
<user>我可以預約顧問嗎</user>
<output>{"reply":"可以，下面的<b>「約顧問」</b>隨時都能約，你剛剛講的都會一起帶給顧問。約之前只想問一件事——你最擔心的是哪一種情況？","chips":["生病了沒收入","老了要人照顧","住院要花很多錢","先不說，直接約"]}</output>
</example>
<example>
<known>起因：家人生病或需要照顧</known>
<ask_now>care_share（照顧費）</ask_now>
<intent>answer</intent>
<user>我媽上個月中風，現在請看護</user>
<output>{"reply":"辛苦了，這段時間一定很累。照顧媽媽的錢，現在主要是誰在出？","chips":["都是我在出","跟兄弟姊妹分","媽媽自己有存款","不太想說"]}</output>
</example>
<example>
<known>來意：想確認現有保單夠不夠｜起因：看到新聞｜家庭：配偶與子女｜收入結構：${DECLINED}</known>
<ask_now>worry（最擔心）</ask_now>
<intent>answer</intent>
<user>這個有點私人，不想講</user>
<output>{"reply":"沒關係，不用勉強。那換個問法——如果真的發生什麼事，你最擔心的是哪一種情況？","chips":["生病了沒收入","老了要人照顧","住院要花很多錢","說不上來"]}</output>
</example>
</examples>`;

const NeedTurnSchema = z.object({ reply: z.string(), chips: z.array(z.string()) });

export interface NeedTurnInput {
  history: Line[];
  known: Values;
  askNow: Slot | null;          // null＝需求點齊了，只回應不提問
  missing: Slot[];
  intent: NeedExtraction["intent"];
  userText: string;
}

export interface NeedTurnResult extends ReplyResult { chips: string[] }

/** 需求點引導的一輪：產生回覆＋選項，過合規（回覆與選項都要過）；被擋重產一次，再被擋就用安全回覆＋備用選項 */
export async function needTurn(m: NeedTurnInput): Promise<NeedTurnResult> {
  const usages: Usage[] = [];
  const blocked: ReplyResult["blocked"] = [];
  const content = `<history>\n${historyXml(m.history)}\n</history>
<known>${knownLine(m.known)}</known>
<ask_now>${m.askNow ? `${m.askNow.key}（${m.askNow.label}）：${m.askNow.ask}` : "無"}</ask_now>
<still_missing>${m.missing.map(s => s.label).join("、") || "無"}</still_missing>
<intent>${m.intent}</intent>
<user>${m.userText}</user>`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const extra = attempt === 2
      ? `上一個版本沒通過檢查（${blocked[0]?.reason}）。這次回覆更短、選項更短，完全不要提任何金額、公司、商品或條款內容，也不要寫出你的考慮過程。`
      : undefined;
    if (aiMock()) {          // 模擬模式：固定模板，規則層照常擋（第二層審查在 compliance.ts 一律通過）
      const o = mockNeedTurn(m);
      usages.push(mockUsage());
      const c = await reviewTurn(o.reply, o.chips);
      if (c.ok) return { html: o.reply, chips: o.chips, usages, blocked, rewritten: attempt > 1 };
      blocked.push({ reason: c.reason!, original: `${o.reply}｜選項：${o.chips.join("／")}`, attempt, layer: c.layer });
      continue;
    }
    const res = await client().beta.messages.parse({
      model: CHAT_MODEL,
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: zodOutputFormat(NeedTurnSchema) },
      system: [{ type: "text", text: NEED_CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content },
        ...(extra ? [{ role: "system" as const, content: extra }] : []),
      ],
    });
    usages.push(usageOf(res.model ?? CHAT_MODEL, res.usage));
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!out?.reply.trim()) { blocked.push({ reason: "模型拒答", original: "", attempt }); continue; }
    const reply = out.reply.trim();
    const chips = m.askNow || m.intent === "book" || m.intent === "emotion" ? out.chips.map(c => c.trim()).filter(Boolean) : [];
    const c = await reviewTurn(reply, chips);
    if (c.usage) usages.push(c.usage);
    if (c.ok) return { html: reply, chips, usages, blocked, rewritten: attempt > 1 };
    blocked.push({ reason: c.reason!, original: `${reply}｜選項：${chips.join("／")}`, attempt, layer: c.layer });
  }
  return { html: SAFE_REPLY, chips: m.askNow?.backup ?? [], usages, blocked, rewritten: true };
}

export interface ReplyResult {
  html: string;
  usages: Usage[];
  blocked: { reason: string; original: string; attempt: number; layer?: "rule" | "ai" }[];   // 被合規層攔下的原句（寫進 compliance_blocks）
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
    const { text, usage } = aiMock() ? { text: mockReply(mode), usage: mockUsage() } : await callChat(content, extra);
    usages.push(usage);
    if (!text) { blocked.push({ reason: "模型拒答", original: "", attempt }); continue; }
    const c = await reviewText(text);
    if (c.usage) usages.push(c.usage);
    if (c.ok) return { html: text, usages, blocked, rewritten: attempt > 1 };
    blocked.push({ reason: c.reason!, original: text, attempt, layer: c.layer });
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
  if (aiMock()) return { html: MOCK_EDU, blocked: false };
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
  if (!out || !(await reviewText(out)).ok) return { html: SAFE_REPLY, blocked: true };
  return { html: out, blocked: false };
}
