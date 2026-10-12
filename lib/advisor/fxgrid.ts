import { evaluateItem, fmtValue, type AnalysisItem, type AnalysisJson, type Held } from "@/lib/passbook/coverage";

/*
 * 十格全險圖（原型 fxRender／FXDEF）：一張商品的每個給付項目放進對應的格子。
 * 跟存摺的「代表數字」不同，這裡要把每一項都列出來（顧問要看完整給付），所以分類比 bucketOf 寬。
 * 算得出金額的顯示金額；要看保費、帳戶價值等算不出來的，顯示條款寫的計算方式。
 */
export const FXDEF: [string, string][] = [
  ["壽險", "身故保險金 · 完全失能保險金 · 祝壽金 · 保費豁免"],
  ["生存金", "生存保險金 · 滿期保險金 · 增值回饋分享金"],
  ["醫療實支", "住院病房 · 手術費 · 醫療雜費 · 門診手術 · 出院療養 · 累積上限"],
  ["定額醫療", "住院日額 · 出院療養 · 加護病房 · 燒燙傷病房 · 住院手術 · 住院看護"],
  ["意外傷害", "意外身故／失能 · 失能扶助 · 重大燒燙傷 · 意外實支 · 骨折未住院"],
  ["防癌", "初次罹癌 · 癌症住院 · 放療化療 · 癌症手術 · 標靶與醫材"],
  ["重大傷病卡", "依健保重大傷病證明一次給付"],
  ["特定傷病", "重大疾病 7 項 · 特定傷病 22 項"],
  ["長照", "長照一次金 · 長照分期給付"],
  ["失能", "1～6 級分期給付 · 2～6 級一次金"],
];

function boxOf(name: string, productType: string, isLimit: boolean): string | null {
  const n = name.normalize("NFKC"), pt = productType;
  if (/癌/.test(n) || /防癌/.test(pt)) return "防癌";
  if (/重大傷病/.test(n) && !/特定/.test(n)) return "重大傷病卡";
  if (/重大疾病|特定傷病|特定重大|重症/.test(n) || /重大疾/.test(pt)) return "特定傷病";
  if (/長期照顧|長照|長期看護/.test(n) || /長照/.test(pt)) return "長照";
  if (/傷害|意外/.test(pt) || /意外|骨折|脫臼|重大燒燙傷/.test(n)) return "意外傷害";
  if (/失能扶助|失能生活|分期/.test(n) || (/失能/.test(n) && /失能/.test(pt))) return "失能";
  if (/身故|完全失能|喪葬|祝壽|豁免/.test(n)) return "壽險";
  if (/生存|滿期|還本|增值|回饋|分享金/.test(n)) return "生存金";
  if (isLimit || /實支|雜費|醫療費用|病房費用/.test(n)) return "醫療實支";
  if (/住院|日額|出院|加護|燒燙傷|手術|看護|療養|門診/.test(n) || /醫療/.test(pt)) return "定額醫療";
  if (/失能/.test(n)) return "失能";
  return null;
}

function formulaText(it: AnalysisItem): string {
  const r = it.insuredRate;
  if (it.valueSource === "insured" && r) {
    const k = r.type === "percentage" ? (x?: number) => `${x}%` : (x?: number) => `${x} 倍`;
    return r.min != null && r.max != null && r.min !== r.max ? `保額 × ${k(r.min)}～${k(r.max)}` : `保額 × ${k(r.rate ?? r.min ?? 1)}`;
  }
  if (it.valueSource === "plan" && it.planValues) return `依計劃：${Object.entries(it.planValues).map(([k, v]) => `${k}＝${v.toLocaleString()}`).join("、")}`;
  if (it.valueSource === "unit" && it.amount != null) return `每單位 ${it.amount.toLocaleString()}${it.unit ?? ""}`;
  if (it.formula) return it.formula;
  return "依條款說明";
}

export interface FxBox { key: string; typ: string; rows: [string, string][]; on: boolean }
export interface FxGrid { boxes: FxBox[]; others: [string, string][]; lim: string | null; filled: number }

export function buildFxGrid(a: AnalysisJson & { waitingPeriod?: { note?: string }; exclusions?: string[] }, held: Held, productType: string | null): FxGrid {
  const boxes = new Map<string, [string, string][]>(FXDEF.map(([k]) => [k, []]));
  const others: [string, string][] = [];
  for (const it of a.items ?? []) {
    const v = evaluateItem(it, held, a.baseUnit);
    const isLimit = it.isLimit === true || (it.isLimit as unknown) === "true";
    const value = v ? `${fmtValue(v.lo, v.hi, v.period)}${isLimit ? "（限額）" : ""}` : formulaText(it);
    const b = boxOf(it.name, productType ?? "", isLimit);
    (b ? boxes.get(b)! : others).push([it.name, value]);
  }
  const wait = a.waitingPeriod?.note?.trim();
  const exc = (a.exclusions ?? []).slice(0, 3).join(" · ");
  const lim = [wait && `等待期：${wait}`, exc && `除外：${exc}`].filter(Boolean).join("　　") || null;
  const out = FXDEF.map(([key, typ]) => ({ key, typ, rows: boxes.get(key)!, on: boxes.get(key)!.length > 0 }));
  return { boxes: out, others, lim, filled: out.filter(b => b.on).length };
}
