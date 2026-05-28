import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { findProduct, storeAnalysis, applyCorrections } from "@/lib/policyCache";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是台灣保險條款分析專家。根據保單條款與投保保額，輸出嚴格的 JSON。

【輸出格式規則（所有欄位強制遵守）】

▌每個欄位值使用「金額｜限制條件」格式：
- 金額：只寫核心數字＋單位，例如「1,000元/日」「1,000~100,000元/次」「15,000元/次」
- ｜後面：天數上限、次數上限、保單年度條件等，例如「最高365日」「限10次」「年限1次」
- 若附表有多個金額，只寫「最低~最高」範圍，不舉例說明項目名稱
- 若有年齡/年度分層，在金額欄用分號分隔：「15,000元/次（1-2年度）；25,000元/次（第3年起）」
- 沒有限制條件則不加｜
- 禁止：解釋計算過程、引用條款編號、舉例說明、重複贅述已知資訊

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
    "diseaseDaily": "N元/日｜最高N日/次（終身 or 定期至N歲）",
    "accidentDaily": "N元/日｜最高N日/次",
    "cancerDaily": "N元/日｜最高N日/次",
    "deductible": "前N日不理賠 或空字串"
  },
  "death": {
    "general": "N萬",
    "accident": "N萬",
    "cancer": "N萬"
  },
  "life": {
    "type": "終身 or 定期至N歲",
    "amount": "N萬",
    "survival": "每N年領N%保額 或空字串"
  },
  "medicalReimbursement": {
    "type": "終身 or 定期至N歲",
    "receiptType": "正本 or 副本 or 正副本均可",
    "hospitalRoom": "N元/日｜最高N日",
    "icu": "N元/日｜最高N日",
    "burn": "N元/日｜最高N日",
    "miscMedical": "最高N萬/次",
    "surgery": "最高N萬/次",
    "outpatientSurgery": "最高N萬/次",
    "specialTreatment": "最高N萬",
    "dischargeCare": "N元/日｜最高N日",
    "transferRoom": "N元/日",
    "annualLimit": "N萬/年"
  },
  "fixedMedical": {
    "type": "終身 or 定期至N歲",
    "unreducedBenefit": "有 or 無",
    "deathBenefit": "有 or 無",
    "hospitalDaily": "N元/日（若年齡分層：N元75歲以下；N元75歲以上）｜最高N日/次",
    "dischargeCare": "N元/日｜最高N日",
    "icu": "N元/日（住院日額N＋加給N，合計N）｜最高N日",
    "burn": "N元/日｜最高N日（與icu不同時才填）",
    "emergency": "N元/次",
    "ambulance": "N元/次",
    "outpatientAroundHospital": "N元/次｜前N日/後N日",
    "surgery": "N~N萬/次（依附表共N項）｜住院/門診均適用",
    "outpatientSurgery": "N元/次",
    "specialSurgery": "N元/次",
    "specificTreatment": "N~N萬/次（依附表共N項）｜限制條件 或空字串",
    "woundClosure": "N~N元/次（依傷口大小）｜限制條件 或空字串",
    "specialMedicalDevice": "N萬/次（1-2年度）；N萬/次（第3年起）｜累積限N次，含心臟支架/人工關節/水晶體等 或空字串",
    "nursing": "N元/日｜最高N日",
    "annualLimit": "N萬｜含各項給付合計",
    "waitDays": "N天"
  },
  "accident": {
    "type": "終身 or 定期至N歲",
    "grade": "N~N職等",
    "publicAccident": "大眾交通工具加倍給付 or 空字串",
    "deathDisability": "N萬｜依等級比例（1級=100%）",
    "disabilityAssist": "N元/月｜最高N年",
    "burnAmount": "N萬｜體表面積N%以上",
    "outpatientReimbursement": "最高N萬/次｜年限N次",
    "hospitalDaily": "N元/日｜最高N日",
    "icu": "N元/日（住院日額N＋加給N）｜最高N日",
    "burn": "N元/日｜最高N日（與icu不同時才填）",
    "outpatientSurgery": "N元/次",
    "fracture": "最高N萬｜依部位比例，大腿完全骨折為最高",
    "dislocation": "最高N萬｜依部位比例",
    "annualLimit": "N萬/年"
  },
  "cancer": {
    "type": "終身 or 定期至N歲",
    "initialCancer": "N萬｜限1次",
    "deathBenefit": "N萬",
    "primaryCancer": "N萬（原位癌）",
    "invasiveCancer": "N萬",
    "earlyCancer": "N萬",
    "mildCancer": "N萬",
    "severeCancer": "N萬",
    "annualCancerBenefit": "N萬/年｜最高N年",
    "hospitalDaily": "N元/日｜最高N日",
    "dischargeCare": "N元/日｜最高N日",
    "radiation": "N元/次｜年限N次",
    "surgery": "N萬/次",
    "chemotherapy": "N元/次｜年限N次",
    "boneMarrow": "N萬｜限1次",
    "prosthetics": "N萬｜限N次",
    "dentures": "N萬｜每年限1次",
    "annualLimit": "N萬/年",
    "waitDays": "N天"
  },
  "criticalIllnessCard": {
    "type": "終身 or 定期至N歲",
    "amount": "N萬｜限1次",
    "waitDays": "N天"
  },
  "majorDisease": {
    "type": "終身 or 定期至N歲",
    "deathBenefit": "N萬",
    "sevenItems": "N萬｜限1次",
    "twentyTwoItems": "N萬｜限1次",
    "waitDays": "N天"
  },
  "longTermCare": {
    "type": "終身 or 定期至N歲",
    "annualBenefit": "N萬/年｜最高N年",
    "lumpSum": "N萬",
    "waitDays": "N天"
  },
  "disability": {
    "type": "終身 or 定期至N歲",
    "grade1to6": "最高N萬｜依等級比例（1級=100%）",
    "grade2to6LumpSum": "最高N萬｜依等級比例",
    "accidentDouble": "最高N萬（已含加倍）"
  },
  "gaps": ["未覆蓋的主要險種，如：無實支實付、無意外險"],
  "exclusions": ["條款明定除外事項，簡短描述"],
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
