import type { Plan } from "./validate";

/*
 * 客戶看得到的規劃書（4-aj、法遵）：只有保障類型與建議額度，不出現商品名、公司名。
 * 完整 plan.json（含 fix、existingNote、actions.detail 這類寫了商品／公司的欄位）只有顧問端拿得到。
 *
 * 做法是「白名單」：只複製列在這裡的欄位，plan.json 日後多了欄位也不會自動漏給客戶。
 * 留下來的自由文字再過一次 scrubText，把「南山人壽」「三商美邦」這類公司名換成「保險公司」（公司名單見 KNOWN＋companies 表）。
 * W4 畫面（11/02 討論）做好之前，這裡就是客戶端 API 唯一的出口。
 */

// 台灣壽險／產險公司的簡稱（另外再加 companies 表裡的名稱）。三商美邦一定要遮（4-aj）
const KNOWN = ["三商美邦", "南山", "國泰", "富邦", "新光", "台灣", "臺灣", "全球", "遠雄", "凱基", "中國", "元大", "安聯", "保誠", "宏泰",
  "台銀", "臺銀", "第一金", "合作金庫", "友邦", "法國巴黎", "法巴", "安達", "康健", "中華郵政", "保德信", "統一安聯", "國華", "幸福", "朝陽",
  "和泰", "明台", "旺旺友聯", "兆豐", "泰安", "華南", "新安東京海上", "臺灣產物", "第一產物", "南山產物", "國泰世紀", "富邦產物"];
const SUFFIX = /(人壽保險股份有限公司|保險股份有限公司|產物保險股份有限公司|股份有限公司|人壽保險|產物保險|人壽|產險|產物|保險)$/u;
const short = (n: string) => n.replace(/（.*?）|\(.*?\)/gu, "").replace(SUFFIX, "").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 把自由文字裡的公司名換成「保險公司」。
 * 公司全名（「南山人壽」「XX產險股份有限公司」）一律換；簡稱只有後面接人壽／產險／保險時才換，
 * 但 3 個字以上的簡稱（三商美邦、合作金庫…）單獨出現也換——「全球」「中國」這種常用詞單獨出現不動。
 */
export function scrubText(s: unknown, extraNames: string[] = []): string {
  if (typeof s !== "string") return "";
  const names = new Set<string>(KNOWN);
  for (const n of extraNames) { const k = short(n); if (k.length >= 2) names.add(k); }
  const list = [...names].sort((a, b) => b.length - a.length).map(esc);
  if (!list.length) return s;
  const withSuffix = new RegExp(`(${list.join("|")})\\s*(人壽保險股份有限公司|產物保險股份有限公司|保險股份有限公司|人壽保險|產物保險|人壽|產險|產物|保險公司|保險)`, "gu");
  const bare = new RegExp(`(${list.filter(n => n.replace(/\\/g, "").length >= 3).join("|")})`, "gu");
  let out = s.replace(withSuffix, "保險公司");
  if (bare.source !== "()") out = out.replace(bare, "保險公司");
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): Plan[] => (Array.isArray(v) ? v.filter(x => x && typeof x === "object") : []);

/** @param extraNames 額外要遮的公司名（例如 companies 表的名稱），不傳就只用內建名單 */
export function clientView(plan: Plan, extraNames: string[] = []) {
  const t = (s: unknown) => scrubText(s, extraNames);
  const meta = plan.meta ?? {}, c = plan.client ?? {}, st = plan.stage ?? {}, fin = plan.finance ?? {};
  return {
    meta: { advisor: t(meta.advisor), advisorTitle: t(meta.advisorTitle), date: t(meta.date), basisYear: num(meta.basisYear) },
    // 客戶自己的資料，只留畫面要用的稱呼與在意的事；收入、負債、健康備註不回傳
    client: { displayName: t(c.displayName), topConcern: t(c.topConcern) },
    stage: { key: t(st.key), label: t(st.label), headline: t(st.headline), topRisks: (Array.isArray(st.topRisks) ? st.topRisks : []).map(t) },
    // 保障類型與建議額度；fix（加保哪張）、existingNote（現有哪張）、gapImpact 不給
    coverage: arr(plan.coverage).map(i => ({
      key: t(i.key), label: t(i.label), metric: t(i.metric), unit: t(i.unit),
      current: num(i.current), target: num(i.target), after: num(i.after), weight: num(i.weight), why: t(i.why),
    })),
    scenarios: arr(plan.scenarios).map(s => ({
      key: t(s.key), label: t(s.label), icon: t(s.icon), totalCost: num(s.totalCost), beforePaid: num(s.beforePaid), afterPaid: num(s.afterPaid),
      breakdown: arr(s.breakdown).map(b => ({ label: t(b.label), amount: num(b.amount) })), note: t(s.note),
    })),
    finance: {
      premium: fin.premium?.enabled ? { beforeTotal: num(fin.premium.beforeTotal), afterTotal: num(fin.premium.afterTotal), totalCoverageBefore: num(fin.premium.totalCoverageBefore), totalCoverageAfter: num(fin.premium.totalCoverageAfter) } : null,
    },
    // 行動方案只留「哪一步、補哪一類」，detail（寫了要買哪張）不給
    actions: arr(plan.actions).map(a => ({ phase: t(a.phase), title: t(a.title), urgency: t(a.urgency), solves: (Array.isArray(a.solves) ? a.solves : []).map(t) })),
    summary: { headline: t(plan.summary?.headline), keyPoints: (Array.isArray(plan.summary?.keyPoints) ? plan.summary.keyPoints : []).map(t) },
    disclaimers: (Array.isArray(plan.disclaimers) ? plan.disclaimers : []).map(t),
  };
}
export type ClientPlanView = ReturnType<typeof clientView>;
