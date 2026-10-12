import type { CalcInputs, CalcResults } from "./engine";

/*
 * 「我的分析」（AI 版）與「我的規劃」（顧問版）的差異說明（實作設計 E5）。
 * 由兩份快照的輸入差異自動產生，顧問不能手寫蓋掉——客戶看得懂為什麼不一樣，兩個數字並存才不會崩。
 * 例：「退休缺口 341 → 298 萬：勞保年資改依你的實際紀錄（20 → 26 年）」
 */
const LABEL: Record<string, [string, (n: number) => string]> = {
  age: ["年齡", n => `${n} 歲`],
  food: ["伙食與日用", n => `${n.toLocaleString()} 元／月`],
  home: ["住", n => `${n.toLocaleString()} 元／月`],
  trans: ["交通", n => `${n.toLocaleString()} 元／月`],
  ret: ["退休年齡", n => `${n} 歲`],
  die: ["規劃到", n => `${n} 歲`],
  save: ["每月存", n => `${n.toLocaleString()} 元`],
  saved: ["現有退休準備", n => `${wan(n)} 萬`],
  est: ["資產總額", n => `${wan(n)} 萬`],
  re: ["不動產比重", n => `${Math.round(n * 100)}%`],
  surv: ["遺族每月開銷", n => `${n.toLocaleString()} 元`],
  loan: ["貸款餘額", n => `${wan(n)} 萬`],
  dep: ["依賴倍數", n => `${n} 倍`],
  inc: ["年收入", n => `${wan(n)} 萬`],
  kid: ["孩子年齡", n => `${n} 歲`],
  laborMonthlyActual: ["勞保年金月領（依你的實際紀錄）", n => `${n.toLocaleString()} 元`],
  laborYearsActual: ["勞保年資（依你的實際紀錄）", n => `${n} 年`],
  lifeCoverExisting: ["現有壽險（依你的保單）", n => `${wan(n)} 萬`],
  heirCash: ["家人自有可動用資金", n => `${wan(n)} 萬`],
};
const wan = (n: number) => Math.round(n / 10000).toLocaleString();

const HEADLINES: [string, (r: CalcResults) => number][] = [
  ["退休缺口", r => r.retirement.gap],
  ["每月要多存", r => r.retirement.add],
  ["應納遺產稅", r => r.estate.tax],
  ["稅源缺口", r => r.taxSource.gap],
  ["遺族長期保障缺口", r => r.survivor.longGap],
];

export interface DiffLine { headline: string; from: number; to: number; because: string[] }

export function explainDiff(ai: { inputs: CalcInputs; results: CalcResults }, adv: { inputs: CalcInputs; results: CalcResults }): DiffLine[] {
  const changed: string[] = [];
  for (const k of new Set([...Object.keys(ai.inputs), ...Object.keys(adv.inputs)])) {
    const a = (ai.inputs as Record<string, number | undefined>)[k], b = (adv.inputs as Record<string, number | undefined>)[k];
    if (a === b || !LABEL[k]) continue;
    const [label, fmt] = LABEL[k];
    changed.push(`${label}${a === undefined ? "補上" : `（${fmt(a)} → `}${b === undefined ? "移除）" : a === undefined ? `：${fmt(b)}` : `${fmt(b)}）`}`);
  }
  if (ai.results.retirement.returnRate !== adv.results.retirement.returnRate) {
    changed.push(`顧問選用假設年報酬 ${adv.results.retirement.returnRate * 100}%（非保證，只影響每月要多存多少）`);
  }
  const lines: DiffLine[] = [];
  for (const [headline, get] of HEADLINES) {
    const from = get(ai.results), to = get(adv.results);
    if (from !== to) lines.push({ headline, from, to, because: changed });
  }
  return lines;
}
