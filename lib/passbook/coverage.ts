/*
 * 每張保單 × 給付公式 → 全險圖（實作設計 P1 ④）。
 *
 * 公式來源是審核產線的 analysis_json（policies 表）：
 *   ・archived（顧問審過）→ 直接用
 *   ・uploaded（AI 讀了、還沒審）→ 客戶端可用，標「AI 初步讀取」（P4）
 * 計算規則與 /api/products/[id]/trial 的 calcItem 相同（value_source：plan／table／insured／unit／fixed／note），
 * 但這裡要的是數字（加總、比較），不是顯示字串。
 *
 * 分類沿用原型 v37「你現在的保障」的十格。不在十格裡的給付項目只列在保單明細，不進總表。
 */

export interface AnalysisItem {
  name: string; unit?: string; valueSource?: string; isLimit?: boolean; formula?: string;
  planValues?: Record<string, number>; tableRange?: { min: number; max: number };
  insuredRate?: { type?: "multiplier" | "percentage"; rate?: number; min?: number; max?: number };
  amount?: number;
}
export interface AnalysisJson { productName?: string; baseUnit?: string; plans?: string[]; items?: AnalysisItem[]; insuranceType?: string[] | string; currency?: string }

/** 客戶持有的量：保額（含單位）或計劃別 */
export interface Held { amount: number | null; unit: string | null; plan: string | null }

export type Period = "" | "/日" | "/次" | "/月" | "/年";
export interface ItemValue { name: string; lo: number; hi: number; period: Period; isLimit: boolean }

const periodOf = (unit?: string): Period => {
  const u = unit ?? "";
  if (/日/.test(u)) return "/日";
  if (/次/.test(u)) return "/次";
  if (/月/.test(u)) return "/月";
  if (/年/.test(u)) return "/年";
  return "";
};
// 項目單位換成「元」的倍數
const scaleOf = (unit?: string) => (unit ?? "").includes("萬") ? 10000 : 1;

/** 保額換成元。存摺寫「100 萬」「30 萬元」「1,000 元」「2 單位」 */
function baseYuan(h: Held, baseUnit?: string): number | null {
  if (h.amount === null) return null;
  const u = `${h.unit ?? ""}${h.unit ? "" : baseUnit ?? ""}`;
  if (/單位/.test(u)) return null;           // 單位制用 unit 算，不用保額
  return /萬/.test(u) ? h.amount * 10000 : h.amount;
}
const units = (h: Held) => (h.unit && /單位/.test(h.unit) ? h.amount : null);
const planKey = (p: string | null) => (p ?? "").normalize("NFKC").replace(/計劃|計畫|方案|型|plan/gi, "").trim().toUpperCase();

export function evaluateItem(it: AnalysisItem, h: Held, baseUnit?: string): ItemValue | null {
  // AI 寫的分析常把布林值寫成字串 "false"——!!"false" 是 true，要明確比對
  const s = scaleOf(it.unit), period = periodOf(it.unit), isLimit = it.isLimit === true || (it.isLimit as unknown) === "true";
  const out = (lo: number, hi = lo): ItemValue | null =>
    Number.isFinite(lo) && Number.isFinite(hi) && hi > 0 ? { name: it.name, lo: Math.round(lo), hi: Math.round(hi), period, isLimit } : null;
  switch (it.valueSource) {
    case "plan": {
      const pv = it.planValues ?? {};
      const k = Object.keys(pv).find(x => planKey(x) === planKey(h.plan));
      return k !== undefined ? out(pv[k] * s) : null;
    }
    case "table": return it.tableRange ? out(it.tableRange.min * s, it.tableRange.max * s) : null;
    case "insured": {
      const b = baseYuan(h, baseUnit); const r = it.insuredRate;
      if (b === null || !r) return null;
      const m = (x?: number) => (r.type === "percentage" ? (x ?? 0) / 100 : x ?? 0);
      if (r.min != null && r.max != null) return out(b * m(r.min), b * m(r.max));
      return out(b * m(r.rate ?? 1));
    }
    case "unit": { const n = units(h); return n !== null && it.amount != null ? out(it.amount * s * n) : null; }
    case "fixed": return it.amount != null ? out(it.amount * s) : null;
    default: return null;       // note：依保費／餘額計算，無法用保額試算
  }
}

// ── 十格 ────────────────────────────────────────────────────────
export type BucketKey = "life" | "survival" | "reimb" | "daily" | "accident" | "cancer" | "card" | "critical" | "ltc" | "disability";
export const BUCKETS: { key: BucketKey; label: string; period: Period }[] = [
  { key: "life", label: "壽險", period: "" },
  { key: "survival", label: "生存金", period: "" },
  { key: "reimb", label: "醫療實支", period: "/次" },
  { key: "daily", label: "定額醫療", period: "/日" },
  { key: "accident", label: "意外傷害", period: "" },
  { key: "cancer", label: "防癌", period: "" },
  { key: "card", label: "重大傷病卡", period: "" },
  { key: "critical", label: "特定傷病", period: "" },
  { key: "ltc", label: "長照", period: "" },
  { key: "disability", label: "失能", period: "/月" },
];

/**
 * 給付項目 → 哪一格的「代表數字」。只有代表項目進總表（例如意外險的住院日額不算進定額醫療的代表數字）。
 * productType 來自商品目錄（傷害險、防癌險、醫療定額…）。
 */
export function bucketOf(itemName: string, productType: string | null, v: ItemValue): BucketKey | null {
  const n = itemName.normalize("NFKC"), pt = productType ?? "";
  const accidentProduct = /傷害/.test(pt);
  const lifeProduct = !pt || /壽險|年金|其他/.test(pt);
  // 「特定重大傷病」是特定傷病的一種；重大傷病卡只認「重大傷病（證明）」本身
  if (/重大傷病/.test(n) && !/特定/.test(n) && v.period === "") return "card";
  if (/癌/.test(n) || /防癌/.test(pt)) return /初次|罹患|罹癌|診斷|確診|一次/.test(n) && v.period === "" ? "cancer" : null;
  if (/重大疾病|特定傷病|特定重大|重大特定|重症/.test(n) && v.period === "") return "critical";
  if (/長期照顧|長照|長期看護/.test(n)) return "ltc";
  if (accidentProduct) return /身故/.test(n) && v.period === "" ? "accident" : null;
  if (/失能/.test(n) && (/扶助|生活|分期/.test(n) || /失能/.test(pt))) return v.period === "/月" ? "disability" : null;
  // 壽險只算壽險類商品的身故／完全失能；醫療、長照附約裡的身故多半是退還保費性質
  if (lifeProduct && /身故|完全失能|喪葬/.test(n) && v.period === "") return "life";
  if (/生存|祝壽|滿期|還本/.test(n)) return "survival";
  if (/實支/.test(n) || v.isLimit) return /雜費|醫療費用/.test(n) && v.period !== "/日" ? "reimb" : null;
  if (v.period === "/日" && /住院|病房|日額/.test(n) && !/加護|燒燙傷|療養|看護/.test(n)) return "daily";
  return null;
}

// 還沒算進來的保單，依商品類型猜它會影響哪一格（P3：標「尚未含此張」）
export function bucketGuess(productType: string | null): BucketKey | null {
  const pt = productType ?? "";
  if (/傷害/.test(pt)) return "accident";
  if (/防癌/.test(pt)) return "cancer";
  if (/重大疾/.test(pt)) return "critical";
  if (/長照/.test(pt)) return "ltc";
  if (/失能/.test(pt)) return "disability";
  if (/醫療/.test(pt)) return "daily";
  if (/壽險/.test(pt)) return "life";
  return null;
}

const yuan = (n: number) => n >= 10000 && n % 1000 === 0 ? `${(n / 10000).toLocaleString()} 萬` : `${n.toLocaleString()} 元`;
export function fmtValue(lo: number, hi: number, period: Period): string {
  const v = lo === hi ? yuan(lo) : `${yuan(lo)}～${yuan(hi)}`;
  if (period === "/日") return `日 ${lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}～${hi.toLocaleString()}`}`;
  if (period === "/月") return `月 ${v}`;
  if (period === "/次") return `${v}／次`;
  if (period === "/年") return `年 ${v}`;
  return v;
}
