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
  "items": [
    {
      "name": "給付項目名稱",
      "formula": "計算公式（純文字，例如：日額×N、保額×N%、定額）",
      "unit": "單位（如 元/日、元/次）",
      "restriction": "限制條件（如 最高365日、限1次、依部位比例）",
      "notes": "備註",
      "pageRef": 條款頁碼數字或 null
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
- 逐章節盤點所有「保險金給付」項目，確認無遺漏再輸出。`;

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

/** 分析一份條款 PDF（base64），回傳結構化分析 JSON。供自動分析排程使用。 */
export async function analyzePolicyPdf(
  pdfBase64: string,
  amount = "每單位 1000 元"
): Promise<AnalyzeResult> {
  const doc: Anthropic.DocumentBlockParam = {
    type: "document",
    source: { type: "base64", media_type: PDF_MEDIA, data: pdfBase64 },
  };

  const category = await detectCategory(doc);
  const sys = (category ? getSpecialistPrompt(category) : null) ?? BASE_PROMPT;

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [doc, { type: "text", text: `保額：${amount}\n\n請分析此保單條款，填入全險圖各欄位。` }],
    }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const jm = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  let data: Record<string, unknown> = { raw: text };
  if (jm) {
    try { data = JSON.parse(jm[1]); } catch { /* keep raw */ }
  }
  return { data, category };
}
