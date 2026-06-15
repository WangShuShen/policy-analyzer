import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_DETECT_PROMPT, getSpecialistPrompt } from "./specialistPrompts";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 通用 fallback prompt（險種辨識失敗時使用；產出與審核頁 AnalysisData 對齊的 JSON）
const BASE_PROMPT = `你是台灣保險條款分析專家。閱讀保單條款後，輸出嚴格的 JSON（只輸出 JSON，不要多餘文字）。

【輸出 schema】
{
  "company": "保險公司全名",
  "productName": "商品名稱",
  "planCode": "計劃代號（若條款未載明可省略）",
  "insuranceType": ["險種分類，可多個"],
  "baseType": "給付基礎（如 日額型 / 實支實付 / 一次金）",
  "plans": ["計劃別清單，如 1,2,3 或 A,B,C；無計劃別則空陣列 []"],
  "items": [
    {
      "name": "給付項目名稱",
      "formula": "計算公式（純文字，例如：日額×N、保額×N%、定額）",
      "unit": "單位（如 元/日、元/次）",
      "restriction": "限制條件（如 最高365日、限1次、依部位比例）",
      "notes": "備註",
      "pageRef": 條款頁碼數字或 null,
      "planValues": { "計劃別→該項數值，如 {\"1\":1000,\"2\":2000}；無計劃別則省略此欄" }
    }
  ],
  "annualLimit": { "formula": "年度累計上限，無則空字串", "notes": "" },
  "waitingPeriod": { "note": "等待期說明，無則空字串" },
  "exclusions": ["除外責任逐條"],
  "specialRestrictions": ["特殊限制逐條"]
}

【格式規則】
- 金額欄位只填純數字＋單位，計算過程／百分比／部位說明不可混進金額。
- 凡條款有倍數關係（日額×N、保額×N%），一律換算成實際數字填入，過程不出現在欄位值。
- 限制條件、特殊規定分別放 restriction / specialRestrictions，不要塞進 formula。
- 逐章節盤點所有「保險金給付」項目，確認無遺漏再輸出。

【計劃別（重要，自動抽取）】
若條款或附表中各項給付金額依「計劃別／型別／方案」不同（常見於定額醫療、實支實付，計劃通常為 1~5 或 A/B/C）：
- plans 填入計劃別清單（如 ["1","2","3"]）
- 每個 item 的 planValues 填各計劃對應數值：若該項是金額型（定額/一次性/限額）填實際金額；若是倍率型填倍數
- 範例：住院日額計劃1=1000、計劃2=2000、計劃3=3000 → "planValues": {"1":1000,"2":2000,"3":3000}
- 若全商品無計劃別差異，plans 填 [] 且省略 planValues

【保額來源識別（決定計算值）】
先判斷此保單的金額來源，再算出合理數值：
- A型 附表：條款附「每壹單位各項給付金額」表 → 各項 = N單位 × 附表欄位（防癌、部分醫療常見）
- B型 直接保額：首頁直接列各項金額 → 直接使用
- C型 回推：條款定義為「主保額之 N%」「日額之 N 倍」→ 找主保額後換算成實際數字
formula 欄位請寫「與保額單位的關係」，例如「日額×1」「保額×100%」「附表單位×1」。

【各險種的單位與型態慣例（依此判斷 baseType / unit / 型態）】
- 壽險（終身/定期/儲蓄/投資/利變/增額/死亡）：身故、完全失能 → 一次性，單位「萬」（幣別依條款）
- 重大疾病／重大傷病：一次金 → 一次性，「萬」
- 醫療（日額型/倍數型）：住院日額、加護、療養 → 定額，「元/日」；手術 → 範圍（最低～最高），「元/次」；年度累計 → 上限，「萬」
- 實支實付：各項 → 限額（reimbursement）；常依「計劃別」不同，note 標明計劃別
- 意外傷害：身故、失能各級 → 一次性「萬」；住院日額 → 定額「元/日」；失能扶助金 → 定額「元/月或元/年」
- 防癌：初次罹癌 → 一次金「萬」；癌症住院日額 → 定額「元/日」；化療/手術 → 每次「元/次」；多為 A 型附表單位制
- 長照：一次金「萬」；分期看護/扶助 → 定額「元/月」；累計總額 → 上限`;

const PDF_MEDIA = "application/pdf";

export interface AnalyzeResult {
  data: Record<string, unknown>;
  category: string | null;
}

async function detectCategory(doc: Anthropic.DocumentBlockParam): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      messages: [{ role: "user", content: [doc, { type: "text", text: CATEGORY_DETECT_PROMPT }] }],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]) as { category?: string; confidence?: number };
    return (p.confidence ?? 0) >= 70 ? (p.category ?? null) : null;
  } catch {
    return null;
  }
}

/** 分析條款 PDF（base64），可選帶費率 PDF（補計劃別來源），回傳結構化分析 JSON。 */
export async function analyzePolicyPdf(
  pdfBase64: string,
  amount = "每單位 1000 元",
  ratePdfBase64?: string
): Promise<AnalyzeResult> {
  const doc: Anthropic.DocumentBlockParam = {
    type: "document",
    source: { type: "base64", media_type: PDF_MEDIA, data: pdfBase64 },
  };

  // 偵測險種僅作標記與單位慣例參考；輸出一律用 BASE_PROMPT 的 items/plans schema
  // （審核頁需要 items/plans，專科 prompt 的全險圖 schema 不相容，故不在此切換）
  const category = await detectCategory(doc);
  const specialistHint = category ? getSpecialistPrompt(category) : null;
  const sys = specialistHint
    ? `${BASE_PROMPT}\n\n【此險種專科提醒（僅供提取參考，輸出仍須遵守上方 items/plans schema）】\n本保單為「${category}」，請特別注意該險種的給付項目完整性與金額換算。`
    : BASE_PROMPT;

  const content: Anthropic.ContentBlockParam[] = [doc];
  if (ratePdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: PDF_MEDIA, data: ratePdfBase64 },
    } as Anthropic.DocumentBlockParam);
    content.push({ type: "text", text: "（附費率表，請從中辨識計劃別與各計劃給付金額，填入 plans 與 planValues）" });
  }
  content.push({ type: "text", text: `保額：${amount}\n\n請分析此保單條款，填入全險圖各欄位。` });

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const jm = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  let data: Record<string, unknown> = { raw: text };
  if (jm) {
    try { data = JSON.parse(jm[1]); } catch { /* keep raw */ }
  }
  return { data, category };
}
