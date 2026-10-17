import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiMock } from "@/lib/consult/mock";

/*
 * 存摺讀清單（實作設計 P1 ①）：只讀「事實」——每張保單的公司、商品名、保額／單位／計劃、生效日、契約狀態。
 * 不讀條款、不判斷保障夠不夠（那是 coverage.ts 和顧問的事）。
 *
 * 模型：Claude Sonnet 5.5。存摺一頁常有十幾列表格，抽取要準（讀錯保額，後面全錯）；一份存摺只呼叫一次，成本不是重點。
 * 輸入：瀏覽器解鎖後送上來的文字（PDF 有文字層）或圖片（截圖、掃描檔）。身分證字號從來不會送到這裡。
 */
const MODEL = "claude-sonnet-5-5";

export const PassbookPolicy = z.object({
  company: z.string().describe("保險公司名稱，照存摺寫的"),
  product_name: z.string().describe("商品名稱，完整照抄，不要簡化"),
  plan_code: z.string().nullable().describe("存摺上的險種代號（若有）"),
  is_rider: z.boolean().nullable().describe("附約為 true、主約為 false、看不出來為 null"),
  amount: z.number().nullable().describe("保額數字（不含單位）。例：100 萬 → 100、unit 填「萬」；計劃別保單填 null"),
  amount_unit: z.string().nullable().describe("保額單位：萬、元、美元、單位…"),
  plan: z.string().nullable().describe("計劃別（例：計劃 3、B 型）；沒有填 null"),
  effective_date: z.string().nullable().describe("契約生效日，換成西元 YYYY-MM-DD（民國年 +1911）"),
  status: z.string().nullable().describe("契約狀態，照存摺寫（有效、停效、繳清、展期、終止…）"),
  insured_is_owner: z.boolean().nullable().describe("被保險人是不是這本存摺的主人（本人）。被保險人欄跟存摺主人不同名（子女、配偶、父母）為 false；同名為 true；存摺上看不出被保險人是誰才填 null"),
  insured_label: z.string().nullable().describe("被保險人是別人時，寫關係或稱呼（例：子女、配偶）；不要寫姓名與身分證字號"),
  annual_premium: z.number().nullable().describe("年繳保費（元），存摺有列才填"),
});
export type PassbookPolicy = z.infer<typeof PassbookPolicy>;

const ReadSchema = z.object({
  is_passbook: z.boolean().describe("這是不是保險存摺或保單清單"),
  policies: z.array(PassbookPolicy),
  unreadable_note: z.string().nullable().describe("有看不清楚、被截斷的地方就寫在這裡"),
});
export type ReadResult = z.infer<typeof ReadSchema>;

const SYSTEM = `你負責把台灣「保險存摺」（壽險公會保單存摺）或保單清單，逐張轉成結構化資料。

規則：
- 每一張保單（主約、附約各算一張）一筆，不要合併、不要漏
- 只抄事實，不推論、不補資料。看不到的欄位填 null
- 金額與日期照實轉換：「100萬元」→ amount 100、amount_unit「萬」；「民國 105 年 3 月 2 日」→ 2016-03-02
- 已終止、已解約、已滿期的也要列出來，status 照寫——要不要算進來，客戶自己確認
- 被保險人：存摺上的被保險人欄跟存摺主人（要保人／存摺抬頭）不同名，就判 insured_is_owner=false；同名判 true；欄位沒寫、看不出被保險人是誰才填 null（顧問定案 4-ay：別人當被保險人的保單不存，看不出來的會請顧問確認）
- 絕對不要輸出任何人的姓名、身分證字號、電話、地址；被保險人不是本人時，insured_label 只寫關係（看不出關係就寫「家人」）
- 不是保險存摺或保單清單（例如傳錯檔案）→ is_passbook=false、policies 空陣列`;

export type PassbookContent =
  | { kind: "text"; pages: string[] }
  | { kind: "images"; images: { mime: "image/png" | "image/jpeg" | "image/webp"; data: string }[] };

export interface ReadUsage { model: string; tokensIn: number; tokensOut: number; costMicroUsd: number }

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

/*
 * 模擬模式（AI_MOCK，防護條件跟諮詢一樣：RADIA_ENV=dev＋開發版網址白名單，上線版永遠走真 AI）：
 * 不管上傳什麼，都回這本示範存摺。五張剛好走過每條路：
 *   ① 國泰享醫靠（資料庫有、已分析，日額）② 國泰實全心意附約（已分析，計劃別 M20）
 *   ③ 富邦好享福終身壽險（資料庫有、還沒分析 → 排隊分析）④ 對不到的商品，被保險人是子女（4-ay：讀完就丟掉，不存）
 *   ⑤ 看不出被保險人是誰（insured_is_owner=null）→ 不算進保障、標「被保險人待確認」，顧問端可以改
 */
const MOCK_PASSBOOK: ReadResult = {
  is_passbook: true,
  unreadable_note: "模擬資料：開發版 AI 為模擬回覆，這不是你上傳的內容",
  policies: [
    { company: "國泰人壽", product_name: "國泰人壽享醫靠醫療終身保險", plan_code: null, is_rider: false, amount: 2000, amount_unit: "元", plan: null,
      effective_date: "2024-10-15", status: "有效", insured_is_owner: true, insured_label: null, annual_premium: 18600 },
    { company: "國泰人壽", product_name: "國泰人壽實全心意住院醫療健康保險附約", plan_code: null, is_rider: true, amount: null, amount_unit: null, plan: "M20",
      effective_date: "2021-06-01", status: "有效", insured_is_owner: true, insured_label: null, annual_premium: 6420 },
    { company: "富邦人壽", product_name: "富邦人壽好享福終身壽險", plan_code: null, is_rider: false, amount: 100, amount_unit: "萬", plan: null,
      effective_date: "2015-05-20", status: "有效", insured_is_owner: true, insured_label: null, annual_premium: 41200 },
    { company: "台灣人壽", product_name: "台灣人壽示範用小額終身壽險", plan_code: null, is_rider: false, amount: 30, amount_unit: "萬", plan: null,
      effective_date: "2019-03-02", status: "有效", insured_is_owner: false, insured_label: "子女", annual_premium: 9800 },
    { company: "國泰人壽", product_name: "國泰人壽示範用傷害保險", plan_code: null, is_rider: false, amount: 100, amount_unit: "萬", plan: null,
      effective_date: "2020-08-01", status: "有效", insured_is_owner: null, insured_label: null, annual_premium: 1200 },
  ],
};

export async function readPassbook(c: PassbookContent): Promise<{ result: ReadResult; usage: ReadUsage }> {
  if (aiMock()) return { result: structuredClone(MOCK_PASSBOOK), usage: { model: "mock", tokensIn: 0, tokensOut: 0, costMicroUsd: 1 } };   // 1 微美元：同 consult 的 mockUsage，讓後台監控測得到
  const content: Anthropic.ContentBlockParam[] = c.kind === "text"
    ? [{ type: "text", text: c.pages.map((p, i) => `【第 ${i + 1} 頁】\n${p}`).join("\n\n") }]
    : c.images.map(img => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mime, data: img.data } }));
  content.push({ type: "text", text: "請把這份存摺裡的每一張保單整理出來。" });

  const res = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "between_tools" } as unknown as Anthropic.ThinkingConfigParam,   // Sonnet 5.5 關掉思考的寫法
    output_config: { effort: "medium", format: zodOutputFormat(ReadSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const u = res.usage;
  const usage = { model: MODEL, tokensIn: u.input_tokens, tokensOut: u.output_tokens, costMicroUsd: Math.ceil(u.input_tokens * 2 + u.output_tokens * 10) };
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("讀不出這份存摺的內容");
  return { result: res.parsed_output, usage };
}
