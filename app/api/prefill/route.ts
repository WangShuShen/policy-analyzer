import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFiles = formData.getAll("files") as File[];
    if (rawFiles.length === 0) return NextResponse.json({});

    const filesToScan = rawFiles.slice(0, 3);
    const contentBlocks: Anthropic.MessageParam["content"] = [];

    for (const file of filesToScan) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      if (file.type === "application/pdf") {
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as Anthropic.DocumentBlockParam);
      } else {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type as "image/jpeg" | "image/png" | "image/webp",
            data: base64,
          },
        });
      }
    }

    contentBlocks.push({
      type: "text",
      text: `快速掃描此保單條款，找出「投保時需要填寫的金額方式」，只輸出下方 JSON，找不到填 null：

{
  "planCode": "計畫代號（如 QDHL2）或 null",
  "year": "條款年份（民國年字串，西元年-1911，如西元2019→'108'）或 null",
  "planType": "型別（甲型/乙型/丙型，有就填）或 null",
  "amountInputType": "計劃別" 或 "單位數" 或 "保額",
  "defaultAmountValue": "建議預設值字串（見下方規則）或 null",
  "planOptions": [{"label": "說明", "value": "數值"}] 或 null
}

【amountInputType 判斷 — 按優先順序】

① 「計劃別」— 條款有「投保計劃表」「費率計劃表」，列出計劃一/計劃二/方案A 等明確選項
  → defaultAmountValue: null
  → planOptions: 列出各計劃（最多8項），label「計劃X（日額N元）」，value 填該計劃的日額或保額數字字串

② 「單位數」— 條款以「每單位保額 N 元/日」「按投保單位計算」「基本保險金額（每單位 N 元）」表達
  → defaultAmountValue: "1"（從1單位開始）
  → planOptions: null

③ 「保額」— 壽險、意外險、重大疾病、重大傷病卡、失能、長照等，投保填總保額金額
  → defaultAmountValue: 從費率表找「最低投保保額」或「常見投保保額」，
    - 如果找到具體金額（如 10 萬、50 萬、100 萬）→ 填 "10萬" 或 "50萬" 等
    - 找不到就填 "100萬"
  → planOptions: null

【planOptions 格式（只有計劃別才填）】
- label: "計劃一（日額 1,000 元）" 或 "方案A（保額 100 萬）"
- value: 只填數字字串，如 "1000"、"2000"、"1000000"

只輸出 JSON，不加任何說明文字。`,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return NextResponse.json({});

    try {
      return NextResponse.json(JSON.parse(jsonMatch[1]));
    } catch {
      return NextResponse.json({});
    }
  } catch (err) {
    console.error("prefill error:", err);
    return NextResponse.json({});
  }
}
