/*
 * 合規檢查第一層：規則攔截（實作設計 I4、N1）。
 * AI 的每一句回覆送出前先過這裡；第二層 AI 審查在 W1b。
 *
 * N1 三條：不得解釋商品內容、不得建議保額、不得比較條款。
 * 規則刻意寫得保守——寧可誤攔一句改送安全回覆，也不要放過一句違規招攬。
 * 腳本裡的固定台詞（lib/consult/script.ts）已經顧問審過，不經過這裡。
 */
export interface ComplianceResult {
  ok: boolean;
  reason?: string;
}

const RULES: { reason: string; re: RegExp }[] = [
  // 建議保額／金額：「建議你保 500 萬」「保額至少要 1000 萬」「補到 30 萬」
  { reason: "建議保額", re: /(建議|應該|最好|至少|要|可以)[^。！？\n]{0,6}(保|買|加保|投保|補)[^。！？\n]{0,4}\d[\d,，.]*\s*(萬|元)/ },
  { reason: "建議保額", re: /(保額|保險金額|額度)[^。！？\n]{0,8}(建議|至少|要|補到|拉到|提高到)[^。！？\n]{0,6}\d/ },
  // 推薦具體商品或保險公司
  { reason: "推薦商品", re: /(推薦|建議|可以考慮|適合你)[^。！？\n]{0,12}(人壽|產險|保險公司|這張|這款|商品|保單)/ },
  { reason: "提到公司名", re: /(南山|國泰|富邦|新光|三商美邦|台灣人壽|全球人壽|中國人壽|凱基|遠雄|安聯|保誠|宏泰|元大|第一金|合作金庫|法國巴黎|安達|友邦|台銀)人壽/ },
  // 解釋或比較條款
  { reason: "解釋條款", re: /(條款|契約)[^。！？\n]{0,10}(寫|規定|約定|載明)[^。！？\n]{0,10}(賠|給付|不賠|除外)/ },
  { reason: "比較條款", re: /(比|比較|勝過|優於|不如)[^。！？\n]{0,10}(這張|那張|別家|其他家|這款|商品)/ },
  // 保證承保／保證報酬（N16、N23）
  { reason: "保證用語", re: /(保證|一定)(會)?(承保|過件|賠|理賠|獲利|報酬|免稅|免遺產稅|免贈與稅)/ },
  // N25：保險給付不得宣稱一定免遺產稅
  { reason: "宣稱免稅", re: /(買|有|用)保險[^。！？\n]{0,6}(就|可以|能)[^。！？\n]{0,3}免(遺產|贈與)?稅/ },
  // 4-ap：面談前不提工具類型，只講路線（投資型沒有 N24 揭露、沒做 KYC 前不能讓客戶看到）
  { reason: "提到工具類型", re: /投資型|變額|利變型|利率變動型|儲蓄險|儲蓄型保險|月配息|類全委|萬能壽險/ },
];

// 4-ai：AI 把自己的猶豫寫進回覆（2026-10-12 實測：「點擊此處預約顧問…不行，不能說，不知道系統有沒有預約按鈕。這樣講就好：……」）
// 或把內部指令念出來（「最後問持續多久」「下一題」）。對客戶來說這是聊天，不是問卷
const LEAK = /不行，|不能說|這樣講就好|這樣說就好|我應該(說|問|回)|系統有沒有|不知道系統|下一題|這一輪|最後問|回到剛剛|撰寫考量|考量：|結果：|```|\*\*|字，符合|ask_now|still_missing|known/;

export function checkCompliance(text: string): ComplianceResult {
  const plain = text.replace(/<[^>]+>/g, "");
  for (const r of RULES) if (r.re.test(plain)) return { ok: false, reason: r.reason };
  if (LEAK.test(plain)) return { ok: false, reason: "思考外洩" };
  return { ok: true };
}

/** 自由對話的一整輪輸出：回覆＋選項都要過（4-ai），還有長度上限（4-au 先回答再邀約，放寬到 160 字） */
export function checkTurn(reply: string, chips: string[]): ComplianceResult {
  const r = checkCompliance(reply);
  if (!r.ok) return r;
  if (reply.replace(/<[^>]+>/g, "").length > 160) return { ok: false, reason: "回覆太長" };
  if (chips.length > 4) return { ok: false, reason: "選項太多" };
  for (const c of chips) {
    if (c.length > 20) return { ok: false, reason: "選項太長" };
    const cr = checkCompliance(c);
    if (!cr.ok) return { ok: false, reason: `選項${cr.reason}` };
    if (/\d[\d,，.]*\s*(萬|元)/.test(c)) return { ok: false, reason: "選項含金額" };
  }
  return { ok: true };
}

/** 連兩次被攔時改送的固定安全回覆 */
export const SAFE_REPLY =
  "這類細節要看條款實際怎麼寫、也要看你的狀況，<b>面談時顧問會對著條款跟你說明</b>。";   // 顧問 10/14：語氣要軟，不說「不能回答」「規定」

// ── 第二層：AI 審查（W1b、w1b-01）────────────────────────────────────
/*
 * 規則層抓不到換句話說的違規（「這種情況多數人會抓年收五倍」「那家的條款比較寬」），
 * 所以規則層放行的句子，再給 Haiku 判一次。這一層只判斷、不改寫；
 * 被判違規就跟規則層一樣，由呼叫端重產一次，再不過就送 SAFE_REPLY（重寫／換安全回覆）。
 * 審查本身出錯（逾時、拒答、格式壞掉）一律當「不通過」——寧可誤攔，不要放過。
 */
import Anthropic from "@anthropic-ai/sdk";
import { aiMock, mockUsage } from "./mock";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const REVIEW_MODEL = "claude-haiku-5-5";
// 每百萬 token 美元價 → 每 token micro-USD，與 ai.ts 的 PRICE 同一套
const REVIEW_PRICE = { in: 0.1, out: 0.5, cacheRead: 0.01 };

export const AI_REASONS = ["建議保額", "推薦商品", "解釋條款", "比較條款", "保證用語", "宣稱免稅", "招攬話術", "其他違規"] as const;

const ReviewSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(AI_REASONS).nullable(),
});

const REVIEW_SYSTEM = `你是保險合規審查員。RADIA 是保險需求訪談的 AI 小幫手，不是業務員；它說出口的每一句話都要先給你檢查。

判斷這段 AI 回覆（可能附帶給使用者點的選項）有沒有違反下面任一條。只要有一條違反就判 ok:false，並填最符合的 reason：
- 建議保額：建議或暗示該保多少、保額幾倍年收、補到多少（就算沒寫數字，例如「保額至少要拉高一點」「多數人會抓年收五倍」也算）
- 推薦商品：推薦或暗示某家保險公司、某張保單、某類商品「適合你」「可以考慮」
- 解釋條款：針對「這個人手上的某一張保單」說它會不會賠、怎麼賠、賠多少、為什麼少賠（例如「你這張應該會賠」「你這張是因為除外所以不賠」）
- 比較條款：比較具體商品或保險公司的好壞、寬嚴，或說哪一種比較適合這個人
- 保證用語：保證承保、保證理賠、保證獲利或報酬
- 宣稱免稅：說保險一定能免遺產稅、免贈與稅、節稅
- 招攬話術：催促購買、製造恐慌促成投保（「不買會後悔」「現在不保就來不及」）
- 其他違規：其他明顯會讓人以為 AI 在給個人化投保建議的內容

可以放行（ok:true，reason:null）：
- 一般保險知識的通則說明，沒有針對這個人下建議（R2：AI 可以做衛教）。例如：
  ・「實支實付是看收據報銷；日額型是照住院天數，一天賠固定的錢」「這兩種沒有誰比較好，是賠的方式不一樣」
  ・常見少賠的原因：每一項有上限、照天數只看住幾天、部分自費或病房差額可能不在範圍、等待期內不賠、有除外項目
  ・保單第一頁看哪裡（保到幾歲、繳到哪一年、主約附約、保額）、主約停了附約通常跟著沒了
  ・理賠一般要準備的文件、拒賠通知通常會寫理由、前幾年解約拿回的通常比繳的少、團保離職就沒了、投保要照實告知
- 講完通則後說「你這張是哪一種／會不會賠，要拿你保單上怎麼寫、對著收據看，顧問會幫你核對」——這是把判斷交給顧問，要放行
- 同理、回應、提問、整理使用者自己講過的話
- 建議找顧問面談、說「這部分顧問會當面說明」、請他上傳保險存摺讓顧問看

只判斷，不要改寫。`;

export interface ReviewResult extends ComplianceResult {
  layer?: "rule" | "ai";
  usage?: { model: string; tokensIn: number; tokensOut: number; costMicroUsd: number };
}

let _reviewClient: Anthropic | null = null;
const reviewClient = () => (_reviewClient ??= new Anthropic());

/** 第二層本體：只做 AI 判斷（規則層請先過） */
export async function aiReview(text: string, chips: string[] = []): Promise<ReviewResult> {
  if (aiMock()) return { ok: true, layer: "ai", usage: mockUsage() };   // 開發版模擬模式：第二層一律通過，規則層照常擋
  const plain = text.replace(/<[^>]+>/g, "");
  const content = `<reply>${plain}</reply>${chips.length ? `\n<chips>${chips.join("／")}</chips>` : ""}`;
  try {
    const res = await reviewClient().messages.parse({
      model: REVIEW_MODEL,
      // Haiku 5.5 預設會先思考：2026-10-16 實測思考就用掉 160 幾個 token，回覆一長 256 就不夠、輸出被截斷 →「審查失敗」被誤擋
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { format: zodOutputFormat(ReviewSchema) },
      system: [{ type: "text", text: REVIEW_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const u = res.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const usage = {
      model: REVIEW_MODEL,
      tokensIn: u.input_tokens + cacheRead + cacheWrite,
      tokensOut: u.output_tokens,
      costMicroUsd: Math.ceil(u.input_tokens * REVIEW_PRICE.in + cacheWrite * REVIEW_PRICE.in * 1.25 + cacheRead * REVIEW_PRICE.cacheRead + u.output_tokens * REVIEW_PRICE.out),
    };
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!out) return { ok: false, reason: "審查失敗", layer: "ai", usage };
    if (out.ok) return { ok: true, layer: "ai", usage };
    return { ok: false, reason: out.reason ?? "其他違規", layer: "ai", usage };
  } catch {
    return { ok: false, reason: "審查失敗", layer: "ai" };
  }
}

/** 兩層合一（單句）：規則層 → AI 審查。給 reply()、eduReply() 用 */
export async function reviewText(text: string): Promise<ReviewResult> {
  const r = checkCompliance(text);
  if (!r.ok) return { ...r, layer: "rule" };
  return aiReview(text);
}

/** 兩層合一（需求點引導一整輪）：規則層 checkTurn → AI 審查回覆＋選項。給 needTurn() 用 */
export async function reviewTurn(reply: string, chips: string[]): Promise<ReviewResult> {
  const r = checkTurn(reply, chips);
  if (!r.ok) return { ...r, layer: "rule" };
  return aiReview(reply, chips);
}
