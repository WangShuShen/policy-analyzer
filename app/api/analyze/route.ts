import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { findProduct, storeAnalysis, applyCorrections } from "@/lib/policyCache";
import { CATEGORY_DETECT_PROMPT, getSpecialistPrompt } from "@/lib/specialistPrompts";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是台灣保險條款分析專家。根據保單條款與投保保額，輸出嚴格的 JSON。

【分析流程（每份保單必做，不可跳過）】
閱讀完整條款後，先在心中完成以下盤點，確認無遺漏再輸出 JSON：
① 逐章節列出條款目錄中所有「保險金給付」項目名稱
② 對照下方【術語對照表】，確認每項都對應到 schema 欄位，無對應的加入 extras
③ 確認加護病房/燒燙傷等含倍數或加給關係的金額已換算為實際數字
④ 確認 category 分類正確（避免把住院費用附約填成醫療實支）

【輸出格式規則（所有欄位強制遵守）】

▌每個欄位值使用「金額｜限制條件｜特別條件」三段格式，嚴格分段：
- 第1段（金額）：純數字＋單位，不可含括號、計算式、百分比、部位名稱、任何說明文字
- 第2段（｜後，限制條件）：天數上限、次數上限、部位說明（「最高365日」「限1次」「依部位比例」）
- 第3段（第二個｜後，特別條件）：加成倍數、體位分層、交通工具加倍等特殊規定，無則省略

▌正確與錯誤對照（務必遵守）

骨折未住院：
  ❌ 「最高175,000（保額500,000×35%，大腿骨頸開放性骨折；閉鎖性見血復位術×75%…）」
  ✓  「最高175,000｜依部位比例，大腿完全骨折為最高」

加護病房（額外加給型）：
  ❌ 「2,000元/日（住院1,000＋加護加給1,000，最高30日）」
  ✓  「2,000元/日｜最高30日」

加護病房（倍數型）：
  ❌ 「2,000元/日（住院日額×2，最高30日）」
  ✓  「2,000元/日｜最高30日」

百分比換算：
  ❌ 「125,000（保額500,000×25%）」
  ✓  「125,000｜限1次」

手術保險金（倍數型）：
  ❌ 「20,000元/次（日額1,000×20倍）」
  ✓  「20,000元/次」

【通用解析規則】（適用所有保單，無論哪家公司）

▌倍數換算（最重要）
凡條款有倍數關係，一律換算為實際金額後填入，結果只寫數字，過程不出現在欄位值：

- 加護病房「額外加給」型：住院日額＋加給額＝合計，填合計數字（如：日額1,000＋加給1,000 → 填「2,000元/日｜最高N日」）
- 加護病房「倍數給付」型：住院日額×N倍＝合計，填合計數字（如：1,000×2 → 填「2,000元/日｜最高N日」）
- 燒燙傷病房：同加護病房邏輯

- 骨折未住院：找附表最大部位（通常大腿/股骨完全骨折），換算：日額×最大日數×係數=最高金額
  → 填「最高N元｜依部位比例，大腿完全骨折為最高」
- 脫臼未住院：同骨折邏輯 → 填「最高N元｜依部位比例」

- 手術保險金（日額×N倍型）：換算後只填結果（日額1,000×20 → 「20,000元/次」）
- 百分比計算（保額×N%型）：換算後只填結果（500,000×25%=125,000 → 「125,000｜限1次」）
- 失能保險金：最高等級實際金額 → 填「最高N元｜依等級比例（1級=100%）」

▌險種分類原則
- 住院費用附約、住院日額附約、住院日額保險 → category 填「定額醫療」，日額填入 fixedMedical.hospitalDaily
- 有分層加倍（1-30日×1；31-90日×1.25；91日起×1.5）的日額 → 將分層說明填入 hospitalDaily 的限制條件（｜後）
- 意外傷害險 → category 填「意外險」，填 accident 區塊
- 純 death benefit 保單 → category 填「壽險」，填 life.amount

▌其他通用規則
- 所有「限N日」「限N次」「年度上限N萬」等上限資訊都要保留在說明文字中
- 燒燙傷病房：與加護病房給付相同就填同一個 icu 欄位；若不同則 icu 填加護病房、burn 填燒燙傷病房
- 等待期：有就填天數，意外險通常無等待期就填 ""
- 終身型/定期型：終身型寫「終身」，定期型寫「定期至N歲」
- 年份：一律使用民國年（西元年 - 1911），如西元2019年 → 填「108」

【術語對照表（各家公司不同寫法→schema 欄位對應）】

▌定額醫療（fixedMedical）
住院保險金 / 住院醫療給付 / 住院給付金 / 住院日額保險金 / 住院醫療保險金 → hospitalDaily
出院療養保險金 / 出院後居家護理保險金 / 出院後療養保險金 / 出院療養給付 → dischargeCare
加護病房保險金 / 加護病房額外加給保險金 / 重症加護病房保險金 → icu
  ※「額外加給」型：住院日額＋加給額＝合計，如「日額3,000＋加給3,000→填6,000元/日」
  ※「倍數給付」型：住院日額×N倍＝合計，如「日額3,000×3倍→填9,000元/日」
燒燙傷病房保險金 / 燒傷病房保險金 → burn（算法同 icu，需換算合計金額）
急診保險金 / 住院前急診醫療保險金 / 緊急救護保險金 / 急診就醫保險金 → emergency
救護車費用保險金 / 救護車運送保險金 / 救護車費用 → ambulance
住院前後門診保險金 / 因住院之門診保險金 / 住院期間門診保險金 → outpatientAroundHospital
外科手術保險金 / 住院手術保險金 / 手術費用保險金（定額型）→ surgery
  ※「住院日額×N倍」型：換算後填實際金額
門診外科手術保險金 / 門診手術保險金 / 門診外科手術費用 → outpatientSurgery
特定手術保險金 / 重大手術保險金 / 特定外科手術加給 → specialSurgery
特定醫療處置保險金 / 特定處置費用 / 雷射手術保險金 → specificTreatment
傷口縫合處置保險金 / 縫合費用保險金 → woundClosure
特殊醫療器材保險金 / 特殊醫材費用補助 / 人工關節/水晶體/心臟支架費用補助 → specialMedicalDevice
住院看護保險金 / 看護費用保險金 / 護理保險金 / 住院看護費用 → nursing
住院慰問保險金 / 慰問金 / 住院慰問金 / 住院探視保險金 → consolationMoney
累積給付上限 / 本附約累積給付上限 / 保單給付上限 / 年度最高給付 → annualLimit

▌意外傷害險（accident）
意外傷害身故保險金＋意外傷害失能保險金（合併寫）→ deathDisability
  ※ 格式：「身故N萬/1級失能N萬｜依等級比例（1級=100%）」
失能扶助保險金 / 殘廢生活補助金 / 失能生活保險金 / 1~11級失能月給付 → disabilityAssist
  ※ 格式：「N萬/月｜最高N個月」，若無期限寫「不限期」
重大燒燙傷保險金 → burnAmount（格式：「N萬｜依體表面積比例」）
意外傷害醫療保險金（實支實付）/ 意外門診醫療費用保險金 → outpatientReimbursement
意外傷害住院保險金 / 傷害住院日額 / 住院醫療保險金（意外險內）→ hospitalDaily
骨折未住院保險金（含骨折日數附表）→ fracture
  ※ 找附表最大部位（通常為大腿/股骨完全骨折），換算：日額×最大日數×係數
脫臼未住院保險金 → dislocation

▌防癌險（cancer）
初次罹患癌症保險金 / 確診癌症一次給付 / 初次癌症診斷保險金 → initialCancer
原位癌保險金 / 原位性癌症 / 第0期癌症 / 非侵襲性癌症保險金 → primaryCancer
侵襲性癌症保險金 / 惡性腫瘤保險金 / 1~4期癌症保險金 → invasiveCancer
輕度惡性腫瘤保險金（較輕程度定義）/ 初期癌症保險金 → earlyCancer
輕度癌症給付 / 輕度惡性腫瘤（次重度）→ mildCancer
重度惡性腫瘤保險金 / 重度癌症給付 / 嚴重惡性腫瘤 → severeCancer
重度惡性腫瘤年給付 / 癌症年度保險金 / 重度癌症每年給付 → annualCancerBenefit
癌症住院日額 / 癌症住院保險金 / 因罹癌住院日額 → hospitalDaily
癌症出院療養保險金 / 癌症出院療養 → dischargeCare
癌症門診醫療保險金 / 門診癌症治療保險金 / 門診治療保險金 / 門診醫療保險金 → outpatientMedical
放射線治療保險金 / 化學治療保險金（單項或合計）→ radiation
癌症手術保險金 / 癌症外科手術保險金 / 一般手術/特定手術 → surgery
化療藥物費用 / 標靶治療費用 / 抗癌藥物保險金 → chemotherapy
骨髓移植保險金 / 造血幹細胞移植保險金 → boneMarrow
義肢保險金 → prosthetics
義齒保險金 → dentures

▌醫療實支（medicalReimbursement）
住院病房費用 / 住院費用保險金（實支）/ 住院費用限額 → hospitalRoom
加護病房費用（實支）→ icu
燒燙傷病房費用（實支）→ burn
醫療雜費 / 住院醫療費用 / 雜項費用 → miscMedical
住院手術費用（實支）/ 外科處置費用（實支）→ surgery
門診手術費用（實支）→ outpatientSurgery
特定處置費用（實支）→ specialTreatment
出院療養費用（實支）→ dischargeCare
轉換病房補助 / 差額病房費用 → transferRoom
年度最高給付（實支）→ annualLimit

【特定商品已知修正】
- 凱基人壽 QDHL2（原保誠康寧終身醫療）：加護病房 = 住院日額×2，非×1
- 凱基人壽 新康健93A 防癌險：等待期90天，累積上限250萬/單位
- 原保誠人壽商品均已被凱基人壽承接

【額外給付項目（所有險種強制執行）】
▌每個險種的 extras 陣列是「補漏網機制」：
- 分析時逐條掃描條款所有給付項目
- 凡條款有明文列出但未被上述預設欄位涵蓋的給付，一律加入該險種的 extras
- extras 格式：[{"label": "中文給付名稱", "value": "金額｜限制條件｜特別規定"}]
- 若無額外項目，extras 填空陣列 []
- 寧可多填 extras，絕不遺漏條款任何給付項目

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
  "life": {
    "type": "終身 or 定期至N歲",
    "amount": "N萬",
    "survival": "每N年領N%保額 或空字串",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
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
    "annualLimit": "N萬/年",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "fixedMedical": {
    "type": "終身 or 定期至N歲",
    "unreducedBenefit": "有 or 無",
    "deathBenefit": "有 or 無",
    "hospitalDaily": "N元/日｜最高N日/次（若有日數分層加倍，如：1-30日×1、31-90日×1.25、91日起×1.5，填入限制條件欄）",
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
    "consolationMoney": "N元/日（住院慰問金，有才填）",
    "annualLimit": "N萬｜含各項給付合計",
    "waitDays": "N天",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
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
    "annualLimit": "N萬/年",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "cancer": {
    "type": "終身 or 定期至N歲",
    "initialCancer": "N元｜限1次｜若有體位加成填此欄",
    "deathBenefit": "N萬",
    "primaryCancer": "N元/單位",
    "invasiveCancer": "N萬",
    "earlyCancer": "N元",
    "mildCancer": "N元｜限1次",
    "severeCancer": "N元｜限1次｜若有豁免保費等特別條件填此欄",
    "annualCancerBenefit": "N萬/年｜最高N年",
    "hospitalDaily": "N元/日｜最高N日",
    "dischargeCare": "N元/日｜最高N日",
    "outpatientMedical": "N元/日（癌症門診醫療，有才填）",
    "radiation": "N元/次｜年限N次",
    "surgery": "N萬/次（住院）；N萬/次（門診）",
    "chemotherapy": "N元/次｜年限N次",
    "boneMarrow": "N萬｜限1次",
    "prosthetics": "N萬｜各肢各限1次",
    "dentures": "N萬｜限1次",
    "annualLimit": "N萬/單位",
    "waitDays": "N天",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "criticalIllnessCard": {
    "type": "終身 or 定期至N歲",
    "amount": "N萬｜限1次",
    "waitDays": "N天",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "majorDisease": {
    "type": "終身 or 定期至N歲",
    "deathBenefit": "N萬",
    "sevenItems": "N萬｜限1次",
    "twentyTwoItems": "N萬｜限1次",
    "waitDays": "N天",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "longTermCare": {
    "type": "終身 or 定期至N歲",
    "annualBenefit": "N萬/年｜最高N年",
    "lumpSum": "N萬",
    "waitDays": "N天",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "disability": {
    "type": "終身 or 定期至N歲",
    "grade1to6": "最高N萬｜依等級比例（1級=100%）",
    "grade2to6LumpSum": "最高N萬｜依等級比例",
    "accidentDouble": "最高N萬（已含加倍）",
    "extras": [{"label": "條款有但上述欄位未涵蓋的給付項目名稱", "value": "金額｜限制條件｜特別規定"}]
  },
  "gaps": ["未覆蓋的主要險種，如：無實支實付、無意外險"],
  "exclusions": ["條款明定除外事項，簡短描述"],
  "waitingPeriods": {
    "疾病": "N天",
    "癌症": "N天",
    "重大疾病": "N天"
  },
  "claimDocuments": {
    "一般住院": ["住院診斷書（含出入院日期）", "醫療費用明細收據", "出院病歷摘要"],
    "手術": ["手術記錄", "麻醉記錄（若全身麻醉）"],
    "癌症": ["病理組織切片報告", "惡性腫瘤診斷書"],
    "意外事故": ["意外事故聲明書", "診斷書（載明意外傷害）"],
    "重大傷病": ["全民健保重大傷病資格認定通知"],
    "長期照護": ["巴氏量表評估報告或長照評估文件"],
    "失能": ["失能診斷書", "失能程度評估表"],
    "身故": ["死亡診斷書", "除戶謄本"]
  }
}
▌claimDocuments 填寫規則：
- 根據本保單的實際涵蓋險種，只填對應的文件類別（例如純防癌險不填「意外事故」欄）
- 若保單有特殊理賠規定（如需檢附健保重大傷病卡），務必列入
- 文件名稱簡短，不超過20字`;

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

// Step 0：用 Haiku 快速辨識險種（約 300–500 token，便宜 5–10x）
async function detectCategory(
  contentBlocks: Anthropic.MessageParam["content"],
): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [
            ...(contentBlocks as Anthropic.ContentBlockParam[]).slice(0, 2), // 只看前兩頁就夠
            { type: "text", text: CATEGORY_DETECT_PROMPT },
          ],
        },
      ],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { category?: string; confidence?: number };
    return (parsed.confidence ?? 0) >= 70 ? (parsed.category ?? null) : null;
  } catch {
    return null;
  }
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

    // Step 0：Haiku 辨識險種
    const detectedCategory = await detectCategory(contentBlocks);

    // Step 1：取得專科 prompt（若有則使用，否則 fallback 到通用 SYSTEM_PROMPT）
    const specialistPrompt = detectedCategory ? getSpecialistPrompt(detectedCategory) : null;
    const activePrompt = specialistPrompt ?? SYSTEM_PROMPT;

    // 使用 prompt caching 降低重複分析同類型保單的 token 成本
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: activePrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
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
