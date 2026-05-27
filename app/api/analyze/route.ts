import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { findProduct, storeAnalysis, applyCorrections } from "@/lib/policyCache";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是台灣保險條款分析專家。根據保單條款與投保保額，輸出嚴格的 JSON。

【通用解析規則】（適用所有保單，無論哪家公司）

▌倍數換算（最重要）
凡條款有倍數關係，一律換算為實際金額後填入，不要只寫「×N倍」：

- 加護病房「額外加給」：若條款寫「額外加給 N元/日」（意即在住院日額之外再加），填入格式為「住院日額＋加給後的合計金額/日」
  例：住院日額1,000＋額外加給1,000 → 填「2,000元/日（住院1,000＋加護加給1,000，最高N日）」
- 加護病房「倍數給付」：若條款寫「住院日額×N倍」，直接換算（例：1,000×2 → 「2,000元/日（最高N日）」）
- 燒燙傷病房：同加護病房邏輯，額外加給要加上住院日額、倍數要換算

- 骨折未住院：條款通常附有骨折日數附表，計算公式為「日額 × 部位日數 × 係數」
  → 找附表中「部位日數」最大的那一行（通常為大腿/股骨完全骨折，如180日）
  → 換算最高金額：日額 × 最高日數 × 係數（如×1/2、×1）
  → 填入格式：「最高 N元（大腿完全骨折：日額×180日×1/2，依部位比例）」
- 脫臼未住院：同骨折邏輯，找附表最大部位換算後填入

- 手術保險金：若為「住院日額×N倍」，換算後填實際金額（例：日額1,000×20 → 「20,000元/次」）
- 失能保險金：若條款列出各等級比例表，填最高等級實際金額（例：保額100萬×100% → 「最高100萬（1級，依等級比例）」）

▌其他通用規則
- 所有「限N日」「限N次」「年度上限N萬」等上限資訊都要保留在說明文字中
- 燒燙傷病房：與加護病房給付相同就填同一個 icu 欄位；若不同則 icu 填加護病房、burn 填燒燙傷病房
- 等待期：有就填天數，意外險通常無等待期就填 ""
- 終身型/定期型：終身型寫「終身」，定期型寫「定期至N歲」
- 年份：一律使用民國年（西元年 - 1911），如西元2019年 → 填「108」

【特定商品已知修正】
- 凱基人壽 QDHL2（原保誠康寧終身醫療）：加護病房 = 住院日額×2，非×1
- 凱基人壽 新康健93A 防癌險：等待期90天，累積上限250萬/單位
- 原保誠人壽商品均已被凱基人壽承接

【輸出規則】
1. 嚴格按照以下 JSON schema 輸出，欄位名稱一字不差
2. 有保障的欄位填入中文說明（格式見各欄位範例）
3. 沒有該項保障的欄位填空字串 ""
4. 不要加任何說明文字，只輸出 JSON

【JSON Schema】
{
  "company": "保險公司名稱（如：新光人壽、南山人壽、凱基人壽）",
  "policyName": "保單/附約完整名稱",
  "planCode": "計畫代號（如：QDHL2）或空字串",
  "planType": "甲型/乙型/丙型 或空字串",
  "policyType": "終身 or 定期至N歲",
  "status": "繳費中 or 繳費期滿",
  "year": "條款年份（民國年，如：108）或空字串",
  "version": "版次（如：v1、第二版）或空字串",
  "category": "定額醫療 or 醫療實支 or 壽險 or 意外險 or 防癌險 or 重大傷病 or 長照 or 失能",
  "hospitalization": {
    "diseaseDaily": "疾病住院日額 N元/日（終身 or 定期至N歲，限N日）",
    "accidentDaily": "意外住院日額 N元/日（終身 or 定期至N歲，限N日）",
    "cancerDaily": "癌症住院日額 N元/日（終身 or 定期至N歲，限N日）",
    "deductible": "自負額說明（如：前3日不理賠）或空字串"
  },
  "death": {
    "general": "一般身故保險金 N萬",
    "accident": "意外身故保險金 N萬",
    "cancer": "癌症身故保險金 N萬"
  },
  "life": {
    "type": "終身 or 定期至N歲",
    "amount": "壽險保額 N萬",
    "survival": "生存還本金說明（如：每N年領回保額N%）或空字串"
  },
  "medicalReimbursement": {
    "type": "終身 or 定期至N歲",
    "receiptType": "正本理賠 or 副本理賠 or 正副本均可",
    "hospitalRoom": "住院病房費 N元/日（最高N日）",
    "icu": "加護病房 N元/日（最高N日）",
    "burn": "燒燙傷病房 N元/日（最高N日）",
    "miscMedical": "醫療雜費 最高N萬/次",
    "surgery": "住院手術費 最高N萬/次",
    "outpatientSurgery": "門診手術費 最高N萬/次",
    "specialTreatment": "特殊醫療處置 最高N萬",
    "dischargeCare": "出院療養 N元/日（最高N日）",
    "transferRoom": "轉換病房費用 N元/日",
    "annualLimit": "年度累積給付上限 N萬"
  },
  "fixedMedical": {
    "type": "終身 or 定期至N歲",
    "unreducedBenefit": "有（理賠不減額）or 無",
    "deathBenefit": "有（身故退還保額）or 無",
    "hospitalDaily": "住院日額 N元/日（最高N日）",
    "dischargeCare": "出院療養 N元/日（最高N日）",
    "icu": "加護病房 N元/日（最高N日）←住院日額＋額外加給 或 日額×倍數，填合計後金額",
    "burn": "燒燙傷病房 N元/日（最高N日）←同icu邏輯，不同時才填此欄",
    "emergency": "住院前急診 N元/次",
    "ambulance": "救護車轉送 N元/次",
    "outpatientAroundHospital": "住院前後門診 N元/次（前N日/後N日）",
    "surgery": "住院手術 N元/次 ←已換算實際金額（如為日額倍數）",
    "outpatientSurgery": "門診手術 N元/次 ←已換算實際金額",
    "specialSurgery": "特定/重大手術 N元/次 ←已換算實際金額",
    "nursing": "住院看護 N元/日（最高N日）",
    "annualLimit": "年度累積給付上限 N萬",
    "waitDays": "疾病等待期 N天"
  },
  "accident": {
    "type": "終身 or 定期至N歲",
    "grade": "職業等級（如：1~2職等）",
    "publicAccident": "大眾運輸工具加倍說明（如：加倍給付意外身故/失能）",
    "deathDisability": "意外身故/完全失能 最高N萬（1級，依等級比例）←已換算",
    "disabilityAssist": "失能扶助金 N元/月（最高N年）",
    "burnAmount": "重大燒燙傷 N萬（體表面積N%以上）",
    "outpatientReimbursement": "意外門診實支實付 最高N元/次（年限N次）",
    "hospitalDaily": "傷害住院日額 N元/日（最高N日）",
    "icu": "加護/燒燙傷病房 N元/日（最高N日）←住院日額＋額外加給 或 日額×倍數，填合計後金額",
    "burn": "燒燙傷病房 N元/日（最高N日）←同icu邏輯，不同時才填此欄",
    "outpatientSurgery": "門診手術 N元/次 ←已換算（如為日額倍數）",
    "fracture": "骨折未住院 最高N元（大腿完全骨折：日額×N日×係數，依部位比例）←查附表換算最高",
    "dislocation": "脫臼未住院 最高N元（查附表最高部位換算後）←依部位比例",
    "annualLimit": "年度累積給付上限 N萬"
  },
  "cancer": {
    "type": "終身 or 定期至N歲",
    "initialCancer": "初次罹癌診斷金 N萬（限1次）",
    "deathBenefit": "癌症身故保險金 N萬",
    "primaryCancer": "原位癌/零期癌 N萬",
    "invasiveCancer": "侵襲性癌症 N萬",
    "earlyCancer": "早期惡性腫瘤 N萬",
    "mildCancer": "輕度癌症 N萬",
    "severeCancer": "重度癌症 N萬",
    "annualCancerBenefit": "癌症年給付 N萬/年（最高N年）",
    "hospitalDaily": "癌症住院日額 N元/日（最高N日）",
    "dischargeCare": "出院療養 N元/日（最高N日）",
    "radiation": "放射線治療 N元/次（年限N次）",
    "surgery": "癌症手術 N萬/次",
    "chemotherapy": "化療/標靶/免疫治療 N元/次（年限N次）",
    "boneMarrow": "骨髓移植 N萬（限1次）",
    "prosthetics": "義肢 N萬（限N次）",
    "dentures": "義齒 N萬（每年限1次）",
    "annualLimit": "年度累積給付上限 N萬",
    "waitDays": "等待期 N天"
  },
  "criticalIllnessCard": {
    "type": "終身 or 定期至N歲",
    "amount": "重大傷病理賠金 N萬（核發重大傷病卡當次給付）",
    "waitDays": "等待期 N天"
  },
  "majorDisease": {
    "type": "終身 or 定期至N歲",
    "deathBenefit": "身故/完全失能退還 N萬",
    "sevenItems": "重大疾病（7項）N萬（限1次）",
    "twentyTwoItems": "特定傷病（22項）N萬（限1次）",
    "waitDays": "等待期 N天"
  },
  "longTermCare": {
    "type": "終身 or 定期至N歲",
    "annualBenefit": "長照年給付 N萬/年（最高N年）",
    "lumpSum": "長照一次金 N萬",
    "waitDays": "等待期 N天"
  },
  "disability": {
    "type": "終身 or 定期至N歲",
    "grade1to6": "1~6級失能 最高N萬（1級=保額×100%，依等級比例）←已換算",
    "grade2to6LumpSum": "2~6級一次金 最高N萬（依等級比例）←已換算",
    "accidentDouble": "意外失能加倍 最高N萬（已含加倍後金額）←已換算"
  },
  "gaps": ["列出此保單未覆蓋的主要險種，如：無實支實付醫療、無意外險、無防癌險"],
  "exclusions": ["條款明定不理賠的情況，如：自殺、戰爭、已存在疾病等"],
  "waitingPeriods": {
    "疾病": "N天",
    "癌症": "N天",
    "重大疾病": "N天"
  }
}`;

function safeSeg(s: string) {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim() || "_";
}

async function saveFiles(
  fileBuffers: { buffer: Buffer; file: File }[],
  company: string,
  year: string,
  policyName: string,
): Promise<{ names: string[]; primaryPath: string | null }> {
  const baseName = safeSeg(policyName || `保單_${Date.now()}`);
  const names: string[] = [];
  let primaryPath: string | null = null;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    for (let i = 0; i < fileBuffers.length; i++) {
      const { buffer, file } = fileBuffers[i];
      const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
      const saveName = fileBuffers.length === 1 ? `${baseName}${ext}` : `${baseName}_${i + 1}${ext}`;
      const pathname = `contracts/${safeSeg(company)}/${safeSeg(year)}/${saveName}`;
      const blob = await put(pathname, buffer, { access: "public", contentType: file.type });
      names.push(saveName);
      if (i === 0) primaryPath = blob.url;
    }
  } else {
    // Local dev fallback
    const { writeFile, mkdir } = await import("fs/promises");
    const path = await import("path");
    const contractDir = path.join(process.cwd(), "contracts", safeSeg(company), safeSeg(year));
    await mkdir(contractDir, { recursive: true });
    for (let i = 0; i < fileBuffers.length; i++) {
      const { buffer, file } = fileBuffers[i];
      const ext = path.extname(file.name) || "";
      const saveName = fileBuffers.length === 1 ? `${baseName}${ext}` : `${baseName}_${i + 1}${ext}`;
      await writeFile(path.join(contractDir, saveName), buffer);
      names.push(saveName);
    }
    const relDir = `contracts/${safeSeg(company)}/${safeSeg(year)}`;
    primaryPath = `${relDir}/${names[0]}`;
  }

  return { names, primaryPath };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFiles = formData.getAll("files") as File[];
    const amount = formData.get("amount") as string;
    const planType = (formData.get("planType") as string) || undefined;
    const year = (formData.get("year") as string) || undefined;
    const version = (formData.get("version") as string) || undefined;
    const planCode = (formData.get("planCode") as string) || undefined;
    const force = formData.get("force") === "true";

    if (rawFiles.length === 0) return NextResponse.json({ error: "未上傳檔案" }, { status: 400 });
    if (!amount) return NextResponse.json({ error: "保額為必填項目" }, { status: 400 });

    const unsupported = rawFiles.find(f => !f.type.startsWith("image/") && f.type !== "application/pdf");
    if (unsupported) return NextResponse.json({ error: `不支援的格式：${unsupported.name}` }, { status: 400 });

    // 先把所有檔案讀進記憶體，分析完後再儲存
    const fileBuffers: { buffer: Buffer; file: File }[] = [];
    for (const file of rawFiles) {
      fileBuffers.push({ buffer: Buffer.from(await file.arrayBuffer()), file });
    }

    // 組裝 Claude content blocks
    const contentBlocks: Anthropic.MessageParam["content"] = [];
    for (const { buffer, file } of fileBuffers) {
      const base64 = buffer.toString("base64");
      if (file.type === "application/pdf") {
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as Anthropic.DocumentBlockParam);
      } else {
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/webp", data: base64 },
        });
      }
    }

    const suffix = rawFiles.length > 1
      ? `以上共 ${rawFiles.length} 張圖片／文件屬於同一份保單，請合併分析後填入全險圖各欄位。`
      : "請分析此保單條款，填入全險圖各欄位。";
    contentBlocks.push({ type: "text", text: `保額：${amount}\n\n${suffix}` });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
    let analysisResult: Record<string, unknown> = {};
    if (jsonMatch) {
      try { analysisResult = JSON.parse(jsonMatch[1]); } catch { analysisResult = { raw: text }; }
    } else {
      analysisResult = { raw: text };
    }

    // 儲存檔案
    const company = (analysisResult.raw ? "未知" : (analysisResult.company as string)) || "未知";
    const resolvedYear = year || (analysisResult.year as string) || "未知年份";
    const policyName = (analysisResult.policyName as string) || "";

    let savedNames: string[] = [];
    let filePath: string | null = null;
    try {
      const saved = await saveFiles(fileBuffers, company, resolvedYear, policyName);
      savedNames = saved.names;
      filePath = saved.primaryPath;
    } catch (e) {
      console.error("File save failed:", e);
    }

    // 儲存到資料庫
    let productId: number | undefined;
    let fromCache = false;

    if (!analysisResult.raw) {
      const resolvedPlanCode = planCode || (analysisResult.planCode as string) || "未知";

      if (!force) {
        const cached = await findProduct({
          company,
          planCode: resolvedPlanCode,
          planType: planType || (analysisResult.planType as string) || undefined,
          year: year || (analysisResult.year as string) || undefined,
          version: version || (analysisResult.version as string) || undefined,
        });

        if (cached) {
          const cachedTemplate = JSON.parse(cached.coverage_template);
          const cachedAmount = cachedTemplate.insuredAmount as string | undefined;
          if (cachedAmount && cachedAmount === amount) {
            const corrected = await applyCorrections(cached.id, cachedTemplate);
            analysisResult = { ...corrected, insuredAmount: amount };
            productId = cached.id;
            fromCache = true;
          }
        }
      }

      if (!analysisResult.insuredAmount) analysisResult.insuredAmount = amount;

      const stored = await storeAnalysis({
        company,
        productName: (analysisResult.policyName as string) || "未知",
        planCode: resolvedPlanCode,
        planType: planType || (analysisResult.planType as string) || undefined,
        year: year || (analysisResult.year as string) || undefined,
        version: version || (analysisResult.version as string) || undefined,
        category: analysisResult.category as string,
        coverageTemplate: analysisResult,
        filePath: filePath ?? undefined,
        insuredAmount: amount,
        analysisJson: analysisResult,
      });
      if (!fromCache) productId = stored.productId;
    }

    return NextResponse.json({
      success: true,
      savedAs: savedNames,
      fromCache,
      productId,
      data: analysisResult,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
