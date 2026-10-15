import type { AskStep } from "./engine";
import type { Extraction, NeedExtraction, NeedTurnInput, ReplyMode, Usage } from "./ai";
import { DECLINED, nextSlot, slotOf, type Values } from "./needs";

/*
 * 模擬 AI 模式（顧問 10/13 定案：開發版 AI 先用模擬的，暫不儲值）。
 * AI_MOCK=1 時，lib/consult 的 AI 呼叫（整理員、說話、衛教、第二層審查）都不打 Anthropic，
 * 改用關鍵字規則與固定模板，讓畫面與流程能走完。用量記 0、model 記 "mock"，不算進費用。
 *
 * ⚠️ 上線版永遠不能是模擬：除了 AI_MOCK=1，還要 RADIA_ENV=dev（上線版永遠不設，跟測試登入同一個標記），
 *    而且 APP_URL 必須是本機或開發版網址（白名單，不是黑名單——網址判斷不出來就當上線版）。
 *    不用 VERCEL_ENV 判斷：開發版是 Vercel 專案 radia-dev 的正式部署，它的 VERCEL_ENV 也是 production。
 */
const DEV_HOSTS = /^(localhost|127\.0\.0\.1)(:\d+)?$|^radia-dev-woad\.vercel\.app$/;

export function aiMock(): boolean {
  if (process.env.AI_MOCK !== "1") return false;
  if (process.env.RADIA_ENV !== "dev") return false;
  try {
    return DEV_HOSTS.test(new URL(process.env.APP_URL ?? "").host);
  } catch {
    return false;
  }
}

// 每次記 1 微美元（0.000001）：小到不影響開發版的費用統計，但讓 N7 上限測得到（T21 把上限調到 0.000001）
export const mockUsage = (): Usage => ({ model: "mock", tokensIn: 0, tokensOut: 0, costMicroUsd: 1 });

// ── 舊步驟的整理器（開場、財務路線的題目）─────────────────────────

const BOOK = /約顧問|找顧問|預約|真人|直接約/;
const KNOWLEDGE = /是什麼|什麼是|差在哪|什麼意思|怎麼算/;
const GREETING = /^(你好|妳好|您好|哈囉|嗨|hi|hello|hey|安安|早安|午安|晚安)[\s!！。.~～,，啊呀喔哦囉]*$/i;
const WANT_ASK = /想(自己)?(詢)?問(一些|幾個|個)?問題|有(些|幾個|個)?問題|想自己問|自己詢問|可以問你|能問你|想問你/;
const ESTIMATED = /大概|左右|差不多|吧|約/;

/** 跟選項文字共有幾個雙字詞——判斷他打的字比較像哪個選項 */
function overlap(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < b.length - 1; i++) if (a.includes(b.slice(i, i + 2))) n++;
  return n;
}

// 選項文字對不到時的關鍵字（開場三選一、財務最擔心、財務子路線）
const OPTION_HINTS: [RegExp, RegExp][] = [
  [/退休/, /退休/],
  [/傳承|下一代|遺產|繼承|傳給/, /下一代|傳承/],
  [/教育|讀書|學費|念書/, /教育/],
  [/說不上來|不知道|不確定|沒想過/, /說不上來|沒想過/],
  [/保單|夠不夠/, /保單夠不夠/],
  [/媽|爸|父|母|家人|中風|生病|看護|照顧/, /生病|照顧/],
  [/準備多少|算算|理財|存錢|財務/, /準備多少錢/],
];

export function mockExtractAnswer(ask: AskStep, text: string): Extraction {
  const none: Extraction = { kind: "unclear", option_index: null, value_number: null, display: null, confidence: "clear" };
  if (BOOK.test(text)) return { ...none, kind: "book" };
  if (KNOWLEDGE.test(text)) return { ...none, kind: "question" };
  if (GREETING.test(text.trim())) return { ...none, kind: "greeting" };
  if (WANT_ASK.test(text)) return { ...none, kind: "want_to_ask" };
  if (/[？?]\s*$/.test(text) && !/\d/.test(text)) return { ...none, kind: "question" };   // 問句（「那投資型保單呢？」）不要被選項關鍵字吃掉
  const confidence = ESTIMATED.test(text) ? "estimated" : "clear";
  // 數字＋歲 → 年齡；數字＋萬 → 金額
  const age = text.match(/(\d{2})\s*歲/);
  if (age && ask.o.some(o => typeof o.n === "number")) return { ...none, kind: "answer", value_number: Number(age[1]), display: `${age[1]} 歲`, confidence };
  const wan = text.match(/(\d+(?:\.\d+)?)\s*萬/);
  if (wan && ask.o.some(o => typeof o.n === "number")) {
    const v = Number(wan[1]) * 10000;
    return { ...none, kind: "answer", value_number: v, display: `約 ${wan[1]} 萬`, confidence };
  }
  // 選項文字最像的那個；平手或太少就看關鍵字
  const scores = ask.o.map(o => overlap(text, `${o.x}${o.v ?? ""}`));
  const best = Math.max(...scores);
  if (best >= 2 && scores.filter(s => s === best).length === 1) return { ...none, kind: "answer", option_index: scores.indexOf(best), confidence };
  for (const [hit, opt] of OPTION_HINTS) {
    if (!hit.test(text)) continue;
    const i = ask.o.findIndex(o => opt.test(o.x));
    if (i >= 0) return { ...none, kind: "answer", option_index: i, confidence };
  }
  if (ask.keys.length === 0) return { ...none, kind: "answer" };      // 反應題：講什麼都算回答
  return none;                                                          // 沒抓到：照程式走（請他從選項挑）
}

// ── 需求點整理員 ───────────────────────────────────────────────────

const DECLINE = /先不說|不想說|不想講|不方便|私人|跳過|不太想說/;

/** 從上往下，先符合先算。順序有意義：「看到別人中風」要先判成新聞，才輪到家人生病 */
const TRIGGER: [RegExp, string][] = [
  [/新聞|看到|網路上|報導/, "看到新聞"],
  [/朋友|同事|鄰居/, "朋友或同事出事"],
  [/過世|剛走|往生|走了/, "家人過世"],
  [/(媽|爸|父|母|家人|老公|老婆|太太|先生|小孩|孩子|家裡有人).*(中風|生病|住院|開刀|照顧|失智|癌|看護)|請看護|家人生病/, "家人生病或需要照顧"],
  [/我(自己)?(身體|生病|住院|開刀|檢查)|自己身體/, "自己身體出狀況"],
  [/只想問我自己|沒什麼|沒特別|就是想確認|單純|定期/, "沒有特別原因"],
];
const CARE_SHARE: [RegExp, string][] = [
  [/都是我|我在出|我一個人出/, "獨自承擔"],
  [/兄弟|姊妹|姐妹|哥|弟|姐|妹|一起分/, "跟兄弟姊妹分"],
  [/自己有存款|自己付|退休金/, "家人自己付"],
];
const CARE_DURATION: [RegExp, string][] = [
  [/不知道要多久|還不知道|不確定/, "還不知道"],
  [/一直|長期|很久/, "沒有明確終點，可能長期"],
  [/復健|會好|幾個月|半年|好轉/, "有明確終點"],
];
const FAMILY: [RegExp, string][] = [
  [/(兩|2)個(小孩|孩子)/, "子女 2 人"],
  [/(老婆|太太|先生|老公|另一半|配偶).*(小孩|孩子|兒|女)/, "配偶與子女"],
  [/只有(另一半|老婆|老公|太太|先生)/, "只有配偶"],
  [/(爸媽|父母).*(養|照顧|靠)|要照顧爸媽|爸媽靠我/, "要照顧爸媽"],
  [/就我自己|單身|沒有人|目前就我|一個人過/, "沒有人靠我"],
];
const INCOME: [RegExp, string][] = [
  [/主要|大部分靠我|都靠我|一個人養|我在賺|靠我撐/, "主要收入來源"],
  [/差不多|雙薪|一起賺/, "雙薪，收入相當"],
  [/(另一半|老婆|老公|太太|先生).*賺比較多/, "次要收入"],
];
const WORRY: [RegExp, string][] = [
  [/沒收入|不能工作|收入(中斷|停)/, "生病後收入中斷"],
  [/要人照顧|沒人照顧|老了/, "長期需要人照顧"],
  [/住院|醫藥費|醫療費|花很多錢/, "住院醫療費用"],
  [/沒人管|家人怎麼辦|我走了|身故|倒下/, "身故後家人生活"],
  [/說不上來/, "說不上來"],
];
const POLICY: [RegExp, string][] = [
  [/團保|公司有/, "有，但不清楚內容"],
  [/沒有保單|沒保|好像沒有/, "沒有保單"],
  [/(不清楚|不知道|不太清楚).*(保|內容)|有.*(不清楚|不知道)/, "有，但不清楚內容"],
  [/大概知道|知道保/, "有，知道內容"],
  [/不確定/, "不確定有沒有"],
];

const first = (rules: [RegExp, string][], text: string) => rules.find(([re]) => re.test(text))?.[1];

export function mockExtractNeeds(known: Values, text: string): NeedExtraction {
  const intent: NeedExtraction["intent"] =
    BOOK.test(text) ? "book"
    : /推薦|哪家|哪一張|保多少|多少才夠/.test(text) ? "product"
    : KNOWLEDGE.test(text) ? "knowledge"
    : /剛走|過世|很亂|在哭/.test(text) ? "emotion"
    : "answer";
  const updates: NeedExtraction["updates"] = [];
  const set = (slot: string, value: string | undefined) => {
    if (value && !updates.some(u => u.slot === slot)) updates.push({ slot, value, confidence: "clear" });
  };
  // 拒答：記在正在問的那一點上（想約顧問時正在問的是「最擔心」）
  if (DECLINE.test(text)) {
    const asking = intent === "book" || /直接約/.test(text) ? slotOf("worry") : nextSlot(known);
    if (asking) set(asking.key, DECLINED);
    return { intent, updates };
  }
  if (/保單.*夠|看看保單|確認保單/.test(text)) set("intent", "想確認現有保單夠不夠");
  set("trigger", first(TRIGGER, text));
  const trigger = updates.find(u => u.slot === "trigger")?.value ?? known.get("trigger") ?? "";
  if (/生病|照顧/.test(trigger)) {
    set("care_share", first(CARE_SHARE, text));
    set("care_duration", first(CARE_DURATION, text));
  }
  if (!/過世/.test(trigger)) set("family", first(FAMILY, text));
  set("income_share", first(INCOME, text));
  set("worry", first(WORRY, text));
  if (/保|團保/.test(text) || first(POLICY, text) === "沒有保單") set("existing_policy", first(POLICY, text));
  return { intent, updates };
}

// ── 說話 ───────────────────────────────────────────────────────────

/** 給客戶看的問句（needs.ts 的 ask 是寫給 AI 看的說明，不能直接講） */
const QUESTION: Record<string, string> = {
  intent: "你今天想先聊哪一塊？",
  trigger: "會想到要看保單，是最近發生了什麼事嗎？",
  care_share: "照顧家人的錢，現在主要是誰在出？",
  care_duration: "醫生有說大概要持續多久嗎？",
  family: "家裡有誰是靠你的嗎？",
  income_share: "家裡的收入，你大概佔多少？",
  worry: "如果真的發生什麼事，你最擔心哪一種情況？",
  existing_policy: "你手上有保單嗎？知道大概保了什麼嗎？",
};
const BOOK_LINE = "可以，下面的「約顧問」隨時都能約，你講的都會一起帶給顧問。";
const ADVISOR_LINE = "這部分要看條款和你的實際狀況，面談時顧問會當面說明。";

export function mockNeedTurn(m: NeedTurnInput): { reply: string; chips: string[] } {
  const ask = m.askNow;
  const q = ask ? QUESTION[ask.key] ?? "" : "";
  if (m.intent === "emotion") return { reply: "辛苦了，慢慢來就好，不用急。", chips: ["想繼續聊", "先休息一下"] };
  if (m.intent === "book") {
    if (ask?.key === "worry") return { reply: `${BOOK_LINE}約之前只想問一件事——你最擔心哪一種情況？`, chips: [...ask.backup.slice(0, 3), "先不說，直接約"] };
    return { reply: BOOK_LINE, chips: ["先去約顧問", "再聊一下"] };
  }
  const lead = m.intent === "product" || m.intent === "knowledge" ? ADVISOR_LINE : "了解，我記下來了。";
  return { reply: q ? `${lead}${q}` : lead, chips: ask ? ask.backup : [] };
}

export function mockReply(m: ReplyMode): string {
  switch (m.kind) {
    case "bridge": return "了解，我記下來了。";
    case "answer_question": return `${ADVISOR_LINE}我們接著聊。`;
    case "clarify": return m.again
      ? "可能是我問得不夠清楚。你可以用自己的話說說最近在意的事，或點下面的選項；想直接跟真人聊，下面的「約顧問」隨時都能約。"
      : "我沒有完全聽懂，可以從上面的選項挑一個嗎？";
    case "greet": return `你好！我們可以從這幾個開始聊：${m.options.join("、")}。點下面的選項，或直接打字跟我說都可以。`;
    case "book": return BOOK_LINE;
  }
}

export const MOCK_EDU = "開發版目前用模擬回覆，這裡還沒有接上真的 AI。保險知識的問題，正式版會由 AI 回答。";
