import { HEALTH_SLOTS } from "@/lib/consult/needs";
import { STEPS, TRENDS, SCRIPT_VERSION } from "@/lib/consult/script";
import { SEED_ASSUMPTIONS, type Assumptions } from "@/lib/calc/assumptions";
import { checkCompliance } from "@/lib/consult/compliance";

/*
 * 後台可改的內容清單（w1b-06、I3、I7、E4）。種子值一律從程式現有的常數來——後台沒發布過的項目就用種子。
 *
 *   AI 問法   q.slot.<需求點>  需求點「要問到什麼」（給 AI 看）＋備用選項（AI 選項連兩次被合規擋時用）
 *            q.line.<步驟>    固定台詞（AI 小幫手說的固定句子）
 *            q.opts.<步驟>    固定題目的選項文字（只改字，不改數量、不改存什麼）
 *   醫療趨勢卡 trend.<卡>      標題／內文／對你的意思；統計要標出處與年份（N17）
 *   試算參數   params.assumptions  數字欄位；要出處、可預設生效日（E4）；報酬率上限不得超過 6%（N23）
 *
 * I7：不改分支結構、不改順序、不改「存哪個需求點」——那是骨架，留給開發。
 */
export type Kind = "question" | "trend" | "params";

export interface ItemDef {
  id: string;
  kind: Kind;
  group: string;                    // 後台左側分組
  title: string;
  hint?: string;
  seed: unknown;
  needsSource: boolean;             // N17：統計要出處與年份
  hasEffectiveDate: boolean;        // E4：參數可預設生效日
}

const short = (h: string, n = 28) => { const t = h.replace(/<[^>]+>/g, "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

// ── 種子 ─────────────────────────────────────────────────────────

/** 試算參數去掉 version／effectiveFrom／sources（版本與生效日由資料庫管，出處在版本上） */
type ParamBody = Omit<Assumptions, "version" | "effectiveFrom" | "sources">;
const paramSeed = (): ParamBody => {
  const { version: _v, effectiveFrom: _e, sources: _s, ...rest } = SEED_ASSUMPTIONS;
  return rest;
};

function buildItems(): ItemDef[] {
  const items: ItemDef[] = [];
  for (const s of HEALTH_SLOTS) {
    items.push({ id: `q.slot.${s.key}`, kind: "question", group: "需求點問法（AI）", title: s.label,
      hint: "「要問到什麼」是給 AI 看的說明，AI 會用自己的話問；備用選項是 AI 被合規擋兩次時改用的選項",
      seed: { ask: s.ask, backup: s.backup }, needsSource: false, hasEffectiveDate: false });
  }
  for (const st of STEPS) {
    if (st.t === "ai") items.push({ id: `q.line.${st.id}`, kind: "question", group: "固定台詞", title: short(st.h),
      hint: "可用 <b>粗體</b> 和 <br> 換行", seed: { text: st.h }, needsSource: false, hasEffectiveDate: false });
    if (st.t === "ask") items.push({ id: `q.opts.${st.id}`, kind: "question", group: "固定題目的選項", title: st.o.map(o => o.x).join("／"),
      hint: "只改選項的字；數量、順序和存成什麼不變", seed: { options: st.o.map(o => o.x) }, needsSource: false, hasEffectiveDate: false });
  }
  for (const [k, [title, body, note]] of Object.entries(TRENDS)) {
    items.push({ id: `trend.${k}`, kind: "trend", group: "醫療趨勢卡", title,
      hint: "客戶會看到的趨勢與數字；統計一定要標出處與年份（N17）", seed: { title, body, note }, needsSource: true, hasEffectiveDate: false });
  }
  items.push({ id: "params.assumptions", kind: "params", group: "試算參數", title: "全域假設參數",
    hint: "通膨、勞保、遺產稅、缺口標準值……改了會影響之後所有試算；舊的分析快照不受影響（記著它用的版本）",
    seed: paramSeed(), needsSource: true, hasEffectiveDate: true });
  return items;
}

let _items: ItemDef[] | null = null;
export const ITEMS = () => (_items ??= buildItems());
export const itemDef = (id: string) => ITEMS().find(i => i.id === id) ?? null;
export const SEED_TAG = `${SCRIPT_VERSION}+${SEED_ASSUMPTIONS.version}`;

// ── 檢查 ─────────────────────────────────────────────────────────

export interface Check { errors: string[]; warnings: string[] }

const isStr = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const allowedHtml = (s: string) => !/<(?!\/?(b|br)\s*\/?>)[^>]*>/i.test(s);   // 只允許 <b> 和 <br>

/** 試算參數攤平成「路徑 → 數字」（Infinity 那格是「以上」，不能改） */
export function flatten(obj: unknown, prefix = ""): [string, number][] {
  if (typeof obj === "number") return Number.isFinite(obj) ? [[prefix, obj]] : [];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flatten(v, `${prefix}.${i}`));
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  return [];
}
const RATE_KEYS = /(inflation|returnRateMax|Rate$|rate[AB]?$|Ratio$|adjustPerYear|\.rate$)/;

export function validate(def: ItemDef, body: unknown, meta: { source?: string | null; sourceYear?: string | null; effectiveFrom?: string | null }): Check {
  const errors: string[] = [], warnings: string[] = [];
  const b = body as Record<string, unknown>;
  if (def.needsSource) {
    if (!isStr(meta.source, 300)) errors.push("要填出處（N17）");
    if (!/^\d{3,4}$/.test(meta.sourceYear ?? "")) errors.push("要填出處年份（民國或西元，例：115 或 2026）");
  }
  if (def.hasEffectiveDate && meta.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(meta.effectiveFrom)) errors.push("生效日格式要是 YYYY-MM-DD");

  if (def.id.startsWith("q.slot.")) {
    if (!isStr(b.ask, 300)) errors.push("「要問到什麼」不能空白，300 字以內");
    const bk = b.backup;
    if (!Array.isArray(bk) || bk.length < 2 || bk.length > 4) errors.push("備用選項要 2～4 個");
    else for (const c of bk) {
      if (!isStr(c, 20)) { errors.push("每個備用選項 1～20 字"); break; }
      const r = checkCompliance(c);
      if (!r.ok) errors.push(`備用選項「${c}」過不了合規（${r.reason}）`);
      if (/\d[\d,，.]*\s*(萬|元)/.test(c)) errors.push(`備用選項「${c}」不能有金額`);
    }
  } else if (def.id.startsWith("q.line.")) {
    if (!isStr(b.text, 400)) errors.push("台詞不能空白，400 字以內");
    else {
      if (!allowedHtml(b.text as string)) errors.push("只能用 <b> 和 <br>");
      const r = checkCompliance(b.text as string);
      if (!r.ok) warnings.push(`合規規則層會判「${r.reason}」——固定台詞不經過合規檢查，請再確認一次`);
    }
  } else if (def.id.startsWith("q.opts.")) {
    const seed = (def.seed as { options: string[] }).options;
    const o = b.options;
    if (!Array.isArray(o) || o.length !== seed.length) errors.push(`選項數量要維持 ${seed.length} 個`);
    else if (!o.every(x => isStr(x, 30))) errors.push("每個選項 1～30 字");
  } else if (def.kind === "trend") {
    for (const [k, label, max] of [["title", "標題", 40], ["body", "內文", 400], ["note", "對你的意思", 400]] as const) {
      if (!isStr(b[k], max)) errors.push(`${label}不能空白，${max} 字以內`);
      else if (!allowedHtml(b[k] as string)) errors.push(`${label}只能用 <b> 和 <br>`);
      else { const r = checkCompliance(b[k] as string); if (!r.ok) warnings.push(`${label}：合規規則層會判「${r.reason}」`); }
    }
  } else if (def.kind === "params") {
    const want = flatten(def.seed).map(([k]) => k).sort().join(), got = flatten(body).map(([k]) => k).sort().join();
    if (want !== got) errors.push("參數欄位跟程式不一致（不能新增或刪除欄位）");
    for (const [k, v] of flatten(body)) {
      if (v < 0) errors.push(`${k} 不能是負數`);
      if (RATE_KEYS.test(k) && v > 1) errors.push(`${k} 是比率，要填 0～1（例：2% 填 0.02）`);
    }
    const p = body as ParamBody;
    if (p.returnRateMax > 0.06) errors.push("報酬率上限不得超過 6%（N23）");
  }
  return { errors, warnings };
}

/** 兩版差在哪些欄位（給發布前預覽） */
export function diff(a: unknown, b: unknown, prefix = ""): { path: string; from: unknown; to: unknown }[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap(k => diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
  }
  return [{ path: prefix || "(全部)", from: a, to: b }];
}
