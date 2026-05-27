import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFiles = formData.getAll("files") as File[];
    if (rawFiles.length === 0) return NextResponse.json({});

    // 只掃前3頁/檔就夠抓基本資料
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
      text: `快速掃描此保單條款，只輸出以下 JSON，找不到的欄位填 null：
{
  "planCode": "計畫代號或商品代號（如 QDHL2）",
  "year": "條款年份，轉換為民國年數字字串（西元年-1911，如西元2019→填 '108'）",
  "version": "版次字串（如 'v1'、'第二版'）",
  "planType": "型別（甲型/乙型/丙型，找到就填第一個）",
  "planOptions": [
    {"label": "計劃一（1,000元/日）", "value": "1000"},
    {"label": "計劃二（2,000元/日）", "value": "2000"}
  ]
}

planOptions 規則：
- 只抓「投保計劃表」或「保額/費率對照表」中的計劃選項，不要抓其他數字
- label 格式：「計劃X（保額說明）」或「X單位（N元）」
- value 填該計劃的基本保額或日額數字
- 最多6個選項
- 找不到就填 null

只輸出 JSON，不要加任何說明文字。`,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
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
