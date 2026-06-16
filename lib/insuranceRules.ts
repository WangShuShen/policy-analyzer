// 險種公式/單位規則引擎（逆向河馬保險 9 險種模型，2026-06）
// 用於：審核頁自動建議公式類型與單位、分析引擎 prompt 生成。
//
// 判斷優先序（高 → 低）：
//   1) 文件實際內容（由 AI/顧問填入，不在此處理）
//   2) 項目名稱關鍵字（itemKeywordRules）
//   3) 細分商品類型預設（categoryDefaults）

export type FormulaType = "fixed" | "multiplier" | "reimbursement" | "range" | "lump_sum";
export type ValueSource = "plan" | "table" | "insured" | "reimbursement" | "fixed";

export interface FormulaSuggestion {
  fType: FormulaType;
  valueSource: ValueSource;
  unit: string;
  rateType?: "multiplier" | "percentage";
}

// ── 第 3 層：細分商品類型 → 預設（類型 + 單位）──
// key 為關鍵字（比對 商品類型 / 險種 / category 字串，命中即套用）
const categoryDefaults: { match: RegExp; fType: FormulaType; unit: string }[] = [
  // 壽險系（終身/定期/儲蓄/投資/增額/利變/平準/死亡）→ 一次性，萬
  { match: /壽險|終身|定期壽|儲蓄|投資型|增額|利率變動|利變|平準|死亡|身故/, fType: "lump_sum", unit: "萬" },
  // 重大疾病 / 重大傷病 → 一次性，萬
  { match: /重大疾|重大傷病|重疾|特定傷病|重症/, fType: "lump_sum", unit: "萬" },
  // 實支實付 → 限額
  { match: /實支|實付|限額/, fType: "reimbursement", unit: "元" },
  // 防癌 / 癌症 → 一次金，萬（日額類由關鍵字覆蓋）
  { match: /防癌|癌症/, fType: "lump_sum", unit: "萬" },
  // 長照 / 失能 → 一次金，萬（分期由關鍵字覆蓋）
  { match: /長照|長期照顧|長期看護|失能/, fType: "lump_sum", unit: "萬" },
  // 意外 / 傷害 → 一次性，萬（日額類由關鍵字覆蓋）
  { match: /意外|傷害/, fType: "lump_sum", unit: "萬" },
  // 定額醫療 / 日額型 / 倍數型 / 住院醫療 → 住院日額，元/日（手術由關鍵字覆蓋）
  { match: /定額醫療|日額型|倍數型|住院醫療|醫療|健康保險/, fType: "fixed", unit: "元/日" },
];

// ── 第 2 層：項目名稱關鍵字 → 覆蓋（最具體優先，由上到下）──
const itemKeywordRules: { match: RegExp; fType: FormulaType; unit: string }[] = [
  // 住院日額 / 病房 / 每日給付 → 定額，元/日
  { match: /住院.*日額|每日給付|每日|日額|病房/, fType: "fixed", unit: "元/日" },
  // 出院/居家療養（每日）→ 定額，元/日
  { match: /出院.*療養|居家.*療養|療養.*每日|照護.*每日/, fType: "fixed", unit: "元/日" },
  // 手術 → 範圍（最低～最高），元/次
  { match: /手術/, fType: "range", unit: "元/次" },
  // 化療/放療/門診醫療/門診（每次）→ 定額，元/次
  { match: /化學治療|放射|化療|放療|門診醫療|門診.*每次/, fType: "fixed", unit: "元/次" },
  // 分期給付 / 扶助金 / 看護(月) → 定額，元/月
  { match: /分期給付|扶助金|看護.*月|照護.*月|每月|\(月\)/, fType: "fixed", unit: "元/月" },
  // 生存金 / 祝壽 → 定額，萬
  { match: /生存|祝壽|滿期|還本/, fType: "fixed", unit: "萬" },
  // 一次性給付類（身故/失能一次金/診斷/確診/罹癌/重大疾病/特定傷病）→ 一次性，萬
  { match: /身故|全殘|完全失能.*一次|一次金|一次給付|診斷|確診|罹癌|罹患|重大疾病|特定傷病/, fType: "lump_sum", unit: "萬" },
  // 實支/雜費/限額 → 限額
  { match: /實支|實付|雜費|醫療限額|限額/, fType: "reimbursement", unit: "元" },
];

function matchCategory(category: string): { fType: FormulaType; unit: string } | null {
  for (const r of categoryDefaults) if (r.match.test(category)) return { fType: r.fType, unit: r.unit };
  return null;
}

/**
 * 依「項目名稱 + 險種(細分商品類型)」建議公式類型與單位。
 * @param itemName 給付項目名稱
 * @param category 商品類型/險種字串（可串接 insuranceType、baseType、category）
 */
// fType → value_source 對應（金額來源）
function sourceOf(fType: FormulaType, itemName: string): ValueSource {
  if (/手術/.test(itemName)) return "table";            // 手術通常依附表項別
  switch (fType) {
    case "lump_sum": return "insured";                  // 一次性＝保額×N%
    case "multiplier": return "insured";                // 倍率＝保額/日額×N
    case "range": return "table";                        // 範圍多為附表
    case "reimbursement": return "reimbursement";       // 限額＝保額(限額)×倍率，獨立來源
    case "fixed": default: return "fixed";              // 定額＝固定金額
  }
}

export function suggestFormula(itemName: string, category = ""): FormulaSuggestion {
  // 第 2 層：項目名稱關鍵字（最優先）
  for (const r of itemKeywordRules) {
    if (r.match.test(itemName)) {
      return { fType: r.fType, valueSource: sourceOf(r.fType, itemName), unit: r.unit, rateType: r.fType === "range" ? "multiplier" : undefined };
    }
  }
  // 第 3 層：細分商品類型預設
  const cat = matchCategory(category);
  if (cat) return { fType: cat.fType, valueSource: sourceOf(cat.fType, itemName), unit: cat.unit, rateType: cat.fType === "range" ? "multiplier" : undefined };

  // 最終 fallback
  return { fType: "fixed", valueSource: "fixed", unit: "元" };
}

// 金額來源 → 顯示標籤與顏色（審核頁標注用）
export const SOURCE_META: Record<ValueSource, { label: string; chip: string }> = {
  plan:    { label: "計劃別", chip: "bg-violet-50 text-violet-700 border border-violet-200" },
  table:   { label: "附表",   chip: "bg-purple-50 text-purple-700 border border-purple-200" },
  insured: { label: "保額計算", chip: "bg-amber-50 text-amber-700 border border-amber-200" },
  reimbursement: { label: "限額", chip: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  fixed:   { label: "定額",   chip: "bg-sky-50 text-sky-700 border border-sky-200" },
};

// 類型 → 顯示標籤與顏色（保留相容）
export const TYPE_META: Record<FormulaType, { label: string; chip: string }> = {
  lump_sum:      { label: "一次性", chip: "bg-amber-50 text-amber-700 border border-amber-200" },
  fixed:         { label: "定額",   chip: "bg-sky-50 text-sky-700 border border-sky-200" },
  reimbursement: { label: "限額",   chip: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  range:         { label: "範圍",   chip: "bg-purple-50 text-purple-700 border border-purple-200" },
  multiplier:    { label: "倍率",   chip: "bg-stone-100 text-stone-600 border border-stone-200" },
};
