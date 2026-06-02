import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VERIFY_SYSTEM_PROMPT = `你是台灣保險條款稽核專家。你會收到原始條款（PDF 或圖片）與 AI 分析結果 JSON。

【稽核任務】對照原始條款，逐一找出 JSON 的問題：
① 計算錯誤：骨折/脫臼金額、加護病房倍數/加給、手術倍數、百分比換算結果不正確
② 欄位錯誤：某給付被填入了錯誤的 schema 欄位
③ 遺漏項目：條款明文列出的給付，JSON 中完全沒有記錄（含 extras 也沒有）
④ 金額讀錯：與條款原文數字明顯不符

【不需稽核】格式（｜分隔）、等待期天數、型態文字，除非與條款明顯矛盾。

【輸出格式】只輸出 JSON，不加任何說明：
{
  "overallConfidence": 整數0到100,
  "suspiciousFields": [
    {
      "field": "schema路徑，如 accident.fracture 或 fixedMedical.icu",
      "severity": "high 或 medium 或 low",
      "issueType": "計算錯誤 或 欄位錯誤 或 金額錯誤 或 分類錯誤",
      "detail": "具體問題，引用條款文字或數字",
      "currentValue": "目前JSON中的值",
      "suggestedValue": "建議更正值（不確定時填空字串）"
    }
  ],
  "missingItems": ["條款有明文但JSON完全未記錄的給付項目簡述"]
}`;

export interface SuspiciousField {
  field: string;
  severity: "high" | "medium" | "low";
  issueType: string;
  detail: string;
  currentValue: string;
  suggestedValue: string;
}

export interface VerificationResult {
  overallConfidence: number;
  suspiciousFields: SuspiciousField[];
  missingItems: string[];
}

export async function verifyAnalysis(
  fileBuffers: { buffer: Buffer; file: File }[],
  analysisResult: Record<string, unknown>,
): Promise<VerificationResult | null> {
  try {
    const blocks: Anthropic.MessageParam["content"] = [];
    for (const { buffer, file } of fileBuffers) {
      const base64 = buffer.toString("base64");
      if (file.type === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as Anthropic.DocumentBlockParam);
      } else {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type as "image/jpeg" | "image/png" | "image/webp",
            data: base64,
          },
        });
      }
    }
    blocks.push({
      type: "text",
      text: `以下是 AI 分析結果，請對照條款稽核：\n\`\`\`json\n${JSON.stringify(analysisResult, null, 2)}\n\`\`\``,
    });

    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: VERIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: blocks }],
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const m = raw.match(/```json\n?([\s\S]*?)\n?```/) || raw.match(/(\{[\s\S]*\})/);
    if (m) return JSON.parse(m[1]) as VerificationResult;
    return null;
  } catch (e) {
    console.error("Verifier failed:", e);
    return null;
  }
}
