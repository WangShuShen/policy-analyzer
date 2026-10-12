import fs from "fs";
import path from "path";

/*
 * 存摺對版本（實作設計 P1 ③）：公司＋商品名（NFKC 正規化）＋「生效日落在哪一版的銷售期間」。
 * 目錄來源：data/drive_registry.json（保發中心商品資料庫爬下來的 13,991 筆，含銷售起訖、主約／附約、險種）。
 * planCode 同時是 policies（審核產線）與 Drive 條款索引的 key，所以對到 planCode 就接得上公式與條款。
 *
 * 同名商品有多個年版、給付不同，只能靠生效日分。對不到就老實說對不到（P3），不猜。
 */

interface RegistryEntry {
  company: string; productName: string; planCode: string;
  contractType?: string; productType?: string; currency?: string; status?: string;
  saleDate?: string; stopDate?: string; category?: string;
}

export interface CatalogProduct {
  planCode: string; company: string; companyKey: string | null; productName: string; norm: string;
  contractType: string | null; productType: string | null; category: string | null; currency: string | null;
  saleDate: string | null; stopDate: string | null;
}

// 保險公司簡稱 → 統一 key。存摺上可能寫全名、簡稱或舊名
const COMPANIES: [string, RegExp][] = [
  ["fubon", /富邦/], ["cathay", /國泰/], ["nanshan", /南山/], ["farglory", /遠雄/], ["mercuries", /三商美邦|三商/],
  ["shinkong", /新光/], ["taiwanlife", /台灣人壽|臺灣人壽/], ["chinalife", /中國人壽/], ["kgi", /凱基|中華人壽/],
  ["transglobe", /全球人壽/], ["allianz", /安聯/], ["prudential", /保誠/], ["hontai", /宏泰/], ["yuanta", /元大/],
  ["firstlife", /第一金/], ["tcb", /合作金庫|合庫/], ["bnp", /法國巴黎|法巴/], ["chubb", /安達/], ["aia", /友邦/], ["bot", /臺銀|台銀/],
];
export function companyKey(name: string): string | null {
  const n = name.normalize("NFKC");
  for (const [k, re] of COMPANIES) if (re.test(n)) return k;
  return null;
}

/** 商品名正規化：NFKC（條款與存摺可能有 CJK 相容字，如 U+F9D1）、去空白與括號、去公司名前綴、台→臺 */
export function normName(s: string): string {
  let n = s.normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[()（）【】\[\]「」『』〈〉《》]/g, "")
    .replace(/台/g, "臺");
  // 只去掉「真的是公司名」的前綴——「美滿終身人壽保險」的「人壽」是商品名的一部分
  const m = n.match(/^(.{2,6}?)(人壽保險股份有限公司|人壽保險事業股份有限公司|人壽)/);
  if (m && companyKey(m[1] + "人壽")) n = n.slice(m[0].length);
  return n.replace(/保險$/, "");
}

let _catalog: CatalogProduct[] | null = null;
export function catalog(): CatalogProduct[] {
  if (_catalog) return _catalog;
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "drive_registry.json"), "utf8")) as Record<string, RegistryEntry>;
  _catalog = Object.values(raw).map(e => ({
    planCode: e.planCode, company: e.company, companyKey: companyKey(e.company), productName: e.productName, norm: normName(e.productName),
    contractType: e.contractType ?? null, productType: e.productType ?? null, category: e.category ?? null, currency: e.currency ?? null,
    saleDate: e.saleDate || null, stopDate: e.stopDate || null,
  }));
  return _catalog;
}

/** 目錄裡有收的公司（三商美邦還沒爬，P3） */
export const coveredCompanies = () => new Set(catalog().map(p => p.companyKey).filter(Boolean) as string[]);

/** 去掉通用字眼後的「核心名」：存摺常把「新住院醫療健康保險附約」簡寫成「新住院醫療附約」 */
const GENERIC = /健康保險|傷害保險|人壽保險|保險|附加條款|特約條款|附約|主約|條款|契約/g;
const core = (norm: string) => norm.replace(GENERIC, "");
// 主約／附約不能混：同一個核心名可能同時有主約版與附約版
const kind = (norm: string) => /附約|附加條款|特約條款/.test(norm) ? "rider" : "main";

// 兩個字串的二元組相似度（Dice），處理存摺簡寫、少幾個字
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

// 銷售期間是否涵蓋生效日。停售日早於開賣日的資料不可信（第 1 步發現 9 筆），當作沒有期間
function inWindow(p: CatalogProduct, date: string): boolean | null {
  if (!p.saleDate) return null;
  if (p.stopDate && p.stopDate < p.saleDate) return null;
  return p.saleDate <= date && (!p.stopDate || date <= p.stopDate);
}

export type MatchResult =
  | { ok: true; product: CatalogProduct; how: "exact" | "similar"; score: number; dateCheck: "in_window" | "no_window" | "single_version" }
  | { ok: false; reason: "company_not_covered" | "unknown_company" | "no_name_match" | "no_version_for_date" | "ambiguous"; candidates?: string[] };

export function matchPolicy(input: { company: string; productName: string; effectiveDate?: string | null }): MatchResult {
  const ck = companyKey(input.company || input.productName);
  if (!ck) return { ok: false, reason: "unknown_company" };
  if (!coveredCompanies().has(ck)) return { ok: false, reason: "company_not_covered" };
  const want = normName(input.productName);
  if (!want) return { ok: false, reason: "no_name_match" };

  const pool = catalog().filter(p => p.companyKey === ck);
  let how: "exact" | "similar" = "exact";
  let cands = pool.filter(p => p.norm === want);
  let score = 1;
  if (!cands.length) {
    // 存摺常把「健康保險附約」寫成「附約」、少「人壽」等：用相似度找最接近的一組名字
    const wantCore = core(want), wantKind = kind(want);
    const scored = pool.map(p => ({ p, s: Math.max(
        dice(p.norm, want),
        p.norm.includes(want) || want.includes(p.norm) ? 0.85 : 0,
        wantCore.length >= 3 && core(p.norm) === wantCore && kind(p.norm) === wantKind ? 0.9 : 0) }))
      .filter(x => x.s >= 0.8).sort((a, b) => b.s - a.s);
    if (!scored.length) return { ok: false, reason: "no_name_match" };
    score = scored[0].s;
    const bestNorm = scored[0].p.norm;
    // 第二名名字不同、分數又很接近 → 不確定是哪個商品，不猜
    const runnerUp = scored.find(x => x.p.norm !== bestNorm);
    if (runnerUp && score - runnerUp.s < 0.05) return { ok: false, reason: "ambiguous", candidates: [scored[0].p.productName, runnerUp.p.productName] };
    cands = pool.filter(p => p.norm === bestNorm);
    how = "similar";
  }

  if (cands.length === 1) {
    const w = input.effectiveDate ? inWindow(cands[0], input.effectiveDate) : null;
    // 只有一個版本：生效日在期間外多半是附約續保或資料起訖不準，仍採用，但標出來
    return { ok: true, product: cands[0], how, score, dateCheck: w === true ? "in_window" : "single_version" };
  }
  // 多個版本：一定要靠生效日分
  if (!input.effectiveDate) return { ok: false, reason: "no_version_for_date", candidates: cands.map(c => `${c.saleDate ?? "?"}～${c.stopDate ?? "現售"}`) };
  const hit = cands.filter(c => inWindow(c, input.effectiveDate!) === true);
  if (hit.length === 1) return { ok: true, product: hit[0], how, score, dateCheck: "in_window" };
  if (hit.length > 1) {
    // 期間重疊（新舊版並行販售）：取開賣日最晚、但不晚於生效日的那一版
    const best = [...hit].sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""))[0];
    return { ok: true, product: best, how, score, dateCheck: "in_window" };
  }
  return { ok: false, reason: "no_version_for_date", candidates: cands.map(c => `${c.saleDate ?? "?"}～${c.stopDate ?? "現售"}`) };
}

export const MATCH_REASON: Record<Exclude<MatchResult, { ok: true }>["reason"], string> = {
  company_not_covered: "這家公司的商品還沒收進資料庫",
  unknown_company: "看不出是哪一家保險公司",
  no_name_match: "資料庫裡找不到這個商品名",
  no_version_for_date: "同名商品有好幾版，對不到你生效日那一版",
  ambiguous: "有兩個名字很像的商品，不確定是哪一個",
};
