/*
 * 規劃書（W4 地基 B3a）的單元測試：plan.json 檢查與客戶版過濾。純函式，不連資料庫、不打網站。
 *   npx tsx scripts/plan-test.mts
 * 範例資料取 advisor-plan skill 的 examples/sample-plan.json（虛構客戶），找不到就跳過整支測試。
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { validatePlan, COVERAGE_KEYS } from "../lib/advisorPlan/validate";
import { clientView, scrubText } from "../lib/advisorPlan/clientView";

const SAMPLE = [process.env.SAMPLE_PLAN, join(homedir(), ".claude/skills/advisor-plan/examples/sample-plan.json"),
  join(process.cwd(), "../../000_Agent/skills/advisor-plan/examples/sample-plan.json")].find(p => p && existsSync(p));
if (!SAMPLE) { console.log("找不到 sample-plan.json（可用 SAMPLE_PLAN=路徑 指定），跳過"); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond || !detail ? "" : `：${detail}`}`); };
const sample = () => JSON.parse(readFileSync(SAMPLE, "utf8"));
const errs = (p: unknown) => validatePlan(p).errors;
const has = (p: unknown, s: string) => errs(p).some(e => e.includes(s));

// ── 檢查：範例通過 ──
{
  const c = validatePlan(sample());
  ok("範例 sample-plan.json 通過檢查", c.ok, c.errors.join("；"));
}

// ── 檢查：壞資料擋得住，而且說哪一欄錯 ──
{ const p = sample(); delete p.coverage; ok("缺 coverage → 擋下", has(p, "缺少必要區塊：coverage")); }
{ const p = sample(); p.client.displayName = ""; ok("client.displayName 空的 → 擋下", has(p, "client.displayName")); }
{ const p = sample(); p.stage.key = ""; ok("stage.key 空的 → 擋下", has(p, "stage.key")); }
{ const p = sample(); p.coverage = p.coverage.filter((c: { key: string }) => c.key !== "ltc"); ok("少列長照 → 擋下（9 個險種都要列）", has(p, "coverage 沒有 ltc")); }
{ const p = sample(); p.coverage[1].current = "20萬"; ok("金額寫成「20萬」字串 → 擋下", has(p, "coverage[1](medicalReimb).current 必須是數字")); }
{ const p = sample(); p.coverage[0].target = 1800000.5; ok("金額有小數 → 擋下（整數元）", has(p, "coverage[0](life).target 必須是整數元")); }
{ const p = sample(); p.coverage[0].weight = 6; ok("weight 6 → 擋下", has(p, "weight 必須是 1~5")); }
{ const p = sample(); p.coverage[2].key = "life"; ok("險種 key 重複 → 擋下", has(p, "key 重複")); }
{ const p = sample(); p.coverage[2].key = "dental"; ok("不認得的險種 key → 擋下", has(p, "key 不認得")); }
{ const p = sample(); delete p.coverage[3].after; ok("險種少 after 欄位 → 擋下", has(p, "coverage[3](accident) 缺少欄位 after")); }
{ const p = sample(); delete p.scenarios[0].afterPaid; ok("情境少 afterPaid → 擋下", has(p, "scenarios[0] 缺少欄位 afterPaid")); }
{ const p = sample(); p.client.annualIncome = "120萬"; ok("年收入寫字串 → 擋下", has(p, "client.annualIncome")); }
ok("不是物件 → 擋下", !validatePlan("hello").ok && !validatePlan(null).ok && !validatePlan([]).ok);
{ const p = sample(); p.coverage[0].why = ""; const c = validatePlan(p); ok("沒填 why 只警告、不擋（同 render_report.py）", c.ok && c.warnings.some(w => w.includes("沒填 why"))); }
{ const p = sample(); p.actions = []; const c = validatePlan(p); ok("沒有 actions 只警告", c.ok && c.warnings.some(w => w.includes("沒有 actions"))); }
{ const p = sample(); p.coverage.forEach((c: { current: unknown }) => (c.current = null)); ok("金額 null（不適用）可以", validatePlan(p).ok); }

// ── 客戶版：不出現商品名、公司名、收入負債健康 ──
{
  const p = sample();
  p.coverage[0].why = "南山人壽的定期壽險最便宜";
  p.summary.keyPoints.push("三商美邦那張先不動");
  p.scenarios[0].note = "國泰 人壽 會賠一部分";
  const v = clientView(p, ["遠雄人壽", "凱基人壽（原保誠人壽）"]);
  const s = JSON.stringify(v);
  ok("客戶版沒有 fix／existingNote／gapImpact／actions.detail", !/"(fix|existingNote|gapImpact|detail)"/.test(s));
  ok("客戶版沒有收入、負債、健康備註", !/annualIncome|mortgageBalance|healthNotes|liquidAssets|monthlyExpense/.test(s));
  ok("客戶版沒有「人壽」「產險」字樣", !/人壽|產險/.test(s), s.match(/.{0,8}(人壽|產險).{0,8}/)?.[0]);
  ok("三商美邦一定不出現（4-aj）", !s.includes("三商美邦"));
  ok("自由文字裡的公司名換成「保險公司」", v.coverage[0].why === "保險公司的定期壽險最便宜", v.coverage[0].why);
  ok("9 個險種的類型與額度都在", COVERAGE_KEYS.every(k => v.coverage.some(c => c.key === k && typeof c.target === "number")));
  ok("情境的金額都在", v.scenarios.length === 3 && v.scenarios.every(x => typeof x.totalCost === "number"));
  ok("行動方案留下「補哪一類」", v.actions[0].solves.includes("disability") && v.actions[0].title === "補上失能扶助");
  ok("plan.json 多了新欄位也不會漏給客戶（白名單）", !JSON.stringify(clientView({ ...sample(), secretField: "x" })).includes("secretField"));
}
ok("險種用語不被誤遮（定期壽險、意外保險）", scrubText("定期壽險和意外保險") === "定期壽險和意外保險");
ok("常用詞單獨出現不遮（全球、中國）", scrubText("全球暖化、中國醫藥大學") === "全球暖化、中國醫藥大學");
ok("簡稱接人壽才遮（全球人壽）", scrubText("全球人壽的實支") === "保險公司的實支");
ok("companies 表的名稱也會遮", scrubText("要保遠雄的", ["遠雄人壽"]) === "要保遠雄的" && scrubText("遠雄人壽的", ["遠雄人壽"]) === "保險公司的");

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail ? 1 : 0);
