/*
 * 全域假設參數（實作設計 E4）。W1a 先用這份種子；W1b 改存資料庫、管理者改動要審核、可預設生效日。
 * 每一筆都要有出處與公告年度（N17）。顧問不能改這裡的任何數字（E5）——只能改客戶資料與報酬率。
 * 每份 analysis_snapshots 記錄它用的 version，舊分析不會因為參數改版而數字變了。
 */
export interface Assumptions {
  version: string;
  effectiveFrom: string;
  inflation: number;                 // 年通膨
  returnRateMax: number;             // 工具試算報酬率上限（E2）；缺口一律 0%
  retirement: {
    medicalMonthly: number;          // 退休後醫療保健（今天物價）
    mortgageThreshold: number;       // 住的開銷 ≥ 這個數，視為含房貸、退休前繳清
    homeAfterPayoff: number;         // 繳清後住的開銷
    transportRatio: number;          // 退休後交通 = 現在 × 這個比例（不通勤）
  };
  labor: {
    startAge: number;                // E3：假設 25 歲開始工作
    insuredMin: number; insuredMax: number;
    insuredDefault: number;          // 沒問到收入時用的投保薪資（不為了一個估算值拉長對話，E3）
    fullAge: number;                 // 老年年金請領年齡
    earliestAge: number;             // 最早可提前請領
    adjustPerYear: number;           // 提前減給／延後增給，每年
    adjustMaxYears: number;
    rateA: number; flatA: number;    // 第一式：薪資 × 年資 × 0.775% + 3,000
    rateB: number;                   // 第二式：薪資 × 年資 × 1.55%
    minYearsForAnnuity: number;      // 年資未滿只能一次請領
    pensionRate: number;             // 勞退新制雇主提繳率
    pensionWageMax: number;
  };
  estate: {
    exemption: number; spouse: number; perChild: number; funeral: number;
    brackets: { upTo: number; rate: number }[];   // 累進：每段只就超過部分課該段稅率
    assumedChildren: number;         // 對話沒問家庭組成時的假設：配偶 ＋ 1 位子女
    giftExemptionPerYear: number;
  };
  taxSource: {
    funeralCash: number;             // 喪葬實際支出（扣除額是稅上的，錢還是要先掏）
    procedureCost: number;           // 代書、鑑價、規費、遺囑認證
    freezeMonths: number;            // 流程保守估
  };
  education: { total: number; finishAge: number };
  // 缺口分級的標準值（實作設計 G5、G7）：現有保障到這個數＝「夠了」。單位：元（失能為每月、實支為每次、日額為每日）
  gapStandards: {
    disability: number; card: number; reimb: number; daily: number; cancer: number; accident: number;
    lifeDependentsBase: number;      // 壽險：房貸餘額＋扶養基數（有配偶或小孩才加）
    lifeMinimum: number;             // 單身又沒負債：只算喪葬實際支出
    maxMust: number;                 // 「一定要補」最多幾項（G2）
    pairCoverMin: Partial<Record<"ltc" | "critical", number>>;   // 重疊的次要那格要到多少才算涵蓋主要那格（G8）
  };
  sources: { item: string; value: string; source: string }[];
}

export const SEED_ASSUMPTIONS: Assumptions = {
  version: "seed-2026-10",
  effectiveFrom: "2026-01-01",
  inflation: 0.02,
  returnRateMax: 0.06,
  retirement: { medicalMonthly: 8000, mortgageThreshold: 20000, homeAfterPayoff: 8000, transportRatio: 0.5 },
  labor: {
    startAge: 25,
    insuredMin: 29500, insuredMax: 45800, insuredDefault: 36300,
    fullAge: 65, earliestAge: 60, adjustPerYear: 0.04, adjustMaxYears: 5,
    rateA: 0.00775, flatA: 3000, rateB: 0.0155, minYearsForAnnuity: 15,
    pensionRate: 0.06, pensionWageMax: 150000,
  },
  estate: {
    exemption: 13_330_000, spouse: 5_530_000, perChild: 560_000, funeral: 1_380_000,
    brackets: [{ upTo: 56_210_000, rate: 0.10 }, { upTo: 112_420_000, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
    assumedChildren: 1,
    giftExemptionPerYear: 2_440_000,
  },
  taxSource: { funeralCash: 400_000, procedureCost: 150_000, freezeMonths: 10 },
  education: { total: 4_000_000, finishAge: 22 },
  gapStandards: {
    disability: 30_000, card: 1_000_000, reimb: 300_000, daily: 2_000, cancer: 1_000_000, accident: 5_000_000,
    lifeDependentsBase: 3_000_000, lifeMinimum: 400_000, maxMust: 2,
    pairCoverMin: { ltc: 1_000_000 },              // 顧問 2026-10-11：長照至少 100 萬才算涵蓋失能；特定傷病未設門檻
  },
  sources: [
    { item: "缺口標準值（失能、重大傷病卡、實支、日額、防癌、意外、壽險扶養基數）", value: "月 3 萬／100 萬／30 萬／日 2,000／100 萬／500 萬／300 萬", source: "顧問 2026-10-11：先用原型值（⚠️ 上線前顧問確認，G5）" },
    { item: "遺產稅免稅額、扣除額、課稅級距；贈與稅免稅額", value: "1,333 萬／配偶 553 萬／子女每人 56 萬／喪葬 138 萬；5,621 萬、11,242 萬；244 萬", source: "財政部 114-11-27 公告，適用 115 年發生之繼承或贈與（與 114 年相同）" },
    { item: "勞保投保薪資下限", value: "29,500", source: "勞動部，115-01-01 起最低工資" },
    { item: "勞保投保薪資上限", value: "45,800", source: "勞工保險投保薪資分級表（⚠️ 115 年版待核對原文）" },
    { item: "勞保老年年金公式", value: "兩式擇優；提前／延後每年 ±4%，最多 5 年", source: "勞工保險條例第 58-1、58 條" },
    { item: "勞退新制提繳", value: "雇主 6%，月提繳工資上限 15 萬", source: "勞工退休金條例第 14 條" },
    { item: "通膨", value: "2%", source: "RADIA 假設值（⚠️ W1b 參數後台審核時補出處）" },
    { item: "退休醫療、交通、房貸繳清、喪葬實支、程序費用、教育金", value: "見各欄", source: "RADIA 假設值，沿用原型 v37（⚠️ 上線前顧問確認）" },
  ],
};

/** 目前生效的參數。W1b 改成從資料庫依生效日取 */
export const currentAssumptions = (): Assumptions => SEED_ASSUMPTIONS;
