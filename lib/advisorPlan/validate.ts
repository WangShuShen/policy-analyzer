/*
 * plan.json 檢查（W4 地基 B3a）。規則對齊 advisor-plan skill 的 scripts/render_report.py validate()，
 * 契約是 skills/advisor-plan/references/plan-schema.md。
 *
 * 比 render_report.py 嚴的兩點（派工 10/15 指定，平台存檔必須擋下）：
 *   1. 9 個險種都要列（render_report.py 只警告）——沒有的填 current: 0
 *   2. 金額一律整數元（render_report.py 收小數）
 * 其餘 render_report.py 的 warning 照樣只當 warning，不擋。
 */
export const PLAN_SCHEMA_VERSION = "1";

export const COVERAGE_KEYS = ["life", "medicalReimb", "medicalFixed", "accident", "cancer",
  "criticalCard", "criticalSpec", "disability", "ltc"] as const;
export type CoverageKey = (typeof COVERAGE_KEYS)[number];
export const COVERAGE_CN: Record<CoverageKey, string> = {
  life: "壽險", medicalReimb: "醫療實支", medicalFixed: "定額醫療", accident: "意外傷害",
  cancer: "防癌", criticalCard: "重大傷病卡", criticalSpec: "特定傷病", disability: "失能", ltc: "長期照顧",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Plan = Record<string, any>;
export interface PlanCheck { ok: boolean; errors: string[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fmt = (n: number) => n.toLocaleString("en-US");

export function validatePlan(plan: unknown): PlanCheck {
  const errors: string[] = [], warnings: string[] = [];
  const done = () => ({ ok: errors.length === 0, errors, warnings });
  if (!isObj(plan)) { errors.push("plan.json 最外層必須是物件"); return done(); }

  for (const k of ["meta", "client", "stage", "coverage"]) if (!(k in plan)) errors.push(`缺少必要區塊：${k}`);
  if (errors.length) return done();
  if (!isObj(plan.client)) errors.push("client 必須是物件");
  if (!isObj(plan.stage)) errors.push("stage 必須是物件");
  if (errors.length) return done();

  const c = plan.client as Plan;
  for (const k of ["displayName", "age"]) if (!c[k]) errors.push(`client.${k} 不可為空`);
  if (!(plan.stage as Plan).key) errors.push("stage.key 不可為空（S1~S5）");

  // 金額欄位：整數元（null＝不適用）
  const money = (where: string, v: unknown) => {
    if (v === null || v === undefined) return;
    if (!isNum(v)) errors.push(`${where} 必須是數字（元），收到 ${JSON.stringify(v)}`);
    else if (!Number.isInteger(v)) errors.push(`${where} 必須是整數元，收到 ${v}`);
  };
  for (const k of ["annualIncome", "spouseAnnualIncome", "monthlyExpense", "mortgageBalance", "liquidAssets"]) money(`client.${k}`, c[k]);

  const cov = plan.coverage;
  if (!Array.isArray(cov) || !cov.length) { errors.push("coverage 必須是非空陣列"); return done(); }
  const seen = new Set<string>();
  cov.forEach((raw: unknown, i) => {
    if (!isObj(raw)) { errors.push(`coverage[${i}] 必須是物件`); return; }
    const item = raw as Plan;
    const where = `coverage[${i}](${item.key ?? "?"})`;
    for (const k of ["key", "label", "current", "target", "after", "weight"]) if (!(k in item)) errors.push(`${where} 缺少欄位 ${k}`);
    if (seen.has(item.key)) errors.push(`${where} key 重複`);
    seen.add(item.key);
    if (item.key !== undefined && !(COVERAGE_KEYS as readonly string[]).includes(item.key)) errors.push(`${where} key 不認得，只能是 ${COVERAGE_KEYS.join(" / ")}`);
    for (const k of ["current", "target", "after"]) money(`${where}.${k}`, item[k]);
    const w = item.weight;
    if (w !== null && w !== undefined && !(Number.isInteger(w) && w >= 1 && w <= 5)) errors.push(`${where}.weight 必須是 1~5 的整數`);
    if (!item.why) warnings.push(`${where} 沒填 why，客戶會看不懂為什麼要這項`);
  });
  for (const k of COVERAGE_KEYS) if (!seen.has(k)) errors.push(`coverage 沒有 ${k}（${COVERAGE_CN[k]}）——9 個險種都要列，沒有的填 current: 0`);

  const scenarios = plan.scenarios ?? [];
  if (!Array.isArray(scenarios)) errors.push("scenarios 必須是陣列");
  else scenarios.forEach((raw: unknown, i) => {
    const where = `scenarios[${i}]`;
    if (!isObj(raw)) { errors.push(`${where} 必須是物件`); return; }
    const s = raw as Plan;
    for (const k of ["label", "totalCost", "beforePaid", "afterPaid"]) if (!(k in s)) errors.push(`${where} 缺少欄位 ${k}`);
    for (const k of ["totalCost", "beforePaid", "afterPaid"]) money(`${where}.${k}`, s[k]);
    if (isNum(s.beforePaid) && isNum(s.totalCost) && s.beforePaid > s.totalCost) warnings.push(`${where} beforePaid 大於 totalCost，請確認`);
    const bd = Array.isArray(s.breakdown) ? s.breakdown : [];
    bd.forEach((b: Plan, j: number) => money(`${where}.breakdown[${j}].amount`, isObj(b) ? b.amount : b));
    if (bd.length && isNum(s.totalCost)) {
      const tot = bd.reduce((a: number, b: Plan) => a + (isObj(b) && isNum(b.amount) ? b.amount : 0), 0);
      if (Math.abs(tot - s.totalCost) > Math.max(10000, s.totalCost * 0.02)) warnings.push(`${where} breakdown 合計 ${fmt(tot)} 與 totalCost ${fmt(s.totalCost)} 不符`);
    }
  });

  const prem = isObj(plan.finance) && isObj(plan.finance.premium) ? plan.finance.premium as Plan : {};
  for (const k of ["beforeTotal", "afterTotal", "totalCoverageBefore", "totalCoverageAfter"]) money(`finance.premium.${k}`, prem[k]);
  if (isNum(prem.afterTotal) && prem.afterTotal && isNum(c.annualIncome) && c.annualIncome) {
    const ratio = prem.afterTotal / c.annualIncome * 100;
    if (ratio > 15) warnings.push(`規劃後保費占年收入 ${ratio.toFixed(1)}%，超過雙十原則上限，確認客戶負擔得起`);
  }
  if (Array.isArray(plan.actions)) plan.actions.forEach((a: Plan, i: number) => isObj(a) && money(`actions[${i}].annualPremium`, a.annualPremium));
  if (!Array.isArray(plan.actions) || !plan.actions.length) warnings.push("沒有 actions，客戶不知道下一步要做什麼");
  if (!Array.isArray(plan.disclaimers) || !plan.disclaimers.length) warnings.push("沒有 disclaimers，對外文件建議補上免責聲明");
  return done();
}
