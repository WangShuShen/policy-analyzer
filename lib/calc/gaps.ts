import type { Assumptions } from "./assumptions";

/*
 * 缺口分級（實作設計 G1–G8、設計準則 N18）。純函式：同樣的保單＋同樣的需求點，永遠同樣的分級。
 * 不用 AI——分級是要顧問核對、要能解釋的東西，不能每次跑出來不一樣。
 *
 * 判級順序（G2，由上往下，先符合先算）：
 *   ① 與別格重疊／儲蓄型 → 這輪先不做（附省錢理由）
 *   ② 現有 ≥ 標準值      → 夠了
 *   ③ 完全沒有＋對上他聊出來的需求點 → 一定要補（最多 2 項）
 *   ④ 其他              → 建議補強
 * 重疊的一對（G8）：已經有其中一格 → 那格「夠了」、另一格最多「建議補強」；兩格都沒有 → 主要那格照判、次要那格先不做。
 */

export type GapKey = "life" | "survival" | "reimb" | "daily" | "accident" | "cancer" | "card" | "critical" | "ltc" | "disability";
export type GapLevel = "must" | "boost" | "ok" | "later";
export const LEVEL_LABEL: Record<GapLevel, string> = { must: "一定要補", boost: "建議補強", ok: "夠了", later: "這輪先不做" };

export interface CurrentCover { key: GapKey; label: string; amount: number; display: string | null; preliminary: boolean; missing: number }

/** 判級需要的客戶資料：從需求點整理出來的（不是原始對話） */
export interface GapFacts {
  care?: string | null;           // 家人中風、正在請看護
  incomeShare?: string | null;    // 收入結構
  debt?: string | null;           // 負債（例：房貸餘額約 500 萬）
  family?: string | null;         // 家庭（例：配偶 ＋ 3 歲孩子）
  buffer?: string | null;         // 存款可支撐多久
  survivorNeed?: number | null;   // 財務分支有年收時：遺族長期需求（4-ae 公式）
}

export interface GapRow {
  key: GapKey; label: string;
  level: GapLevel;
  current: string;                // 現在：「沒有」或金額
  standard: string | null;        // 標準值：「月 3 萬」；不設標準的格子為 null
  reason: string;                 // 為什麼是這一級（「一定要補」引用他自己說的話）
  preliminary: boolean;           // 現有金額含 AI 初步讀取
  pendingNote: string | null;     // 還有幾張在確認，可能改變結果
}

const wan = (n: number) => n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString()} 萬` : `${n.toLocaleString()} 元`;
const fmtStd: Record<string, (n: number) => string> = {
  disability: n => `月 ${wan(n)}`, reimb: n => `${wan(n)}／次`, daily: n => `日 ${n.toLocaleString()}`,
};
const showStd = (k: GapKey, n: number) => (fmtStd[k] ?? wan)(n);

/** 對話裡的負債描述 → 金額（「房貸餘額約 500 萬」「1,000 萬以上」） */
export function debtAmount(text: string | null | undefined): number {
  if (!text || /無|沒有/.test(text)) return 0;
  const m = text.normalize("NFKC").replace(/,/g, "").match(/([\d.]+)\s*萬/);
  return m ? Math.round(Number(m[1]) * 10000) : 0;
}
const hasDependents = (family?: string | null) => !!family && /配偶|孩|子女|小孩|父母|扶養/.test(family) && !/單身|無扶養/.test(family);

/** 需求點 → 對上的格子（G6）。順序就是「一定要補」超過上限時的取捨順序 */
export function triggersOf(f: GapFacts): { key: GapKey; quote: string }[] {
  const out: { key: GapKey; quote: string }[] = [];
  if (f.care) out.push({ key: "disability", quote: f.care });
  if (f.incomeShare && /主要/.test(f.incomeShare)) { out.push({ key: "disability", quote: f.incomeShare }); out.push({ key: "card", quote: f.incomeShare }); }
  if (debtAmount(f.debt) > 0) out.push({ key: "life", quote: f.debt! });
  if (hasDependents(f.family)) out.push({ key: "life", quote: f.family! });
  if (f.buffer && /個月|半年/.test(f.buffer)) { out.push({ key: "card", quote: f.buffer }); out.push({ key: "reimb", quote: f.buffer }); }
  return out;
}

/** 壽險標準值（G7）：有年收用遺族公式；否則房貸＋扶養基數；單身沒負債只算喪葬 */
export function lifeStandard(f: GapFacts, A: Assumptions): number {
  if (f.survivorNeed && f.survivorNeed > 0) return f.survivorNeed;
  const debt = debtAmount(f.debt), dep = hasDependents(f.family);
  if (!debt && !dep) return A.gapStandards.lifeMinimum;
  return debt + (dep ? A.gapStandards.lifeDependentsBase : 0);
}

// 重疊的一對：[主要, 次要, 次要先不做的理由]
const PAIRS: [GapKey, GapKey, string][] = [
  ["disability", "ltc", "和失能扶助性質重疊——兩個都做等於重複付錢"],
  ["card", "critical", "重大傷病卡的涵蓋範圍更寬，先做那張"],
];
const SAVINGS_REASON = "儲蓄性質，先把保障補起來再談";

export function gradeGaps(cover: CurrentCover[], f: GapFacts, A: Assumptions): GapRow[] {
  const S = A.gapStandards;
  const std: Partial<Record<GapKey, number>> = {
    disability: S.disability, card: S.card, reimb: S.reimb, daily: S.daily, cancer: S.cancer, accident: S.accident, life: lifeStandard(f, A),
  };
  const by = new Map(cover.map(c => [c.key, c]));
  const has = (k: GapKey) => (by.get(k)?.amount ?? 0) > 0;
  const triggers = triggersOf(f);
  const rows = new Map<GapKey, GapRow>();

  const base = (c: CurrentCover): Omit<GapRow, "level" | "reason"> => ({
    key: c.key, label: c.label, current: c.display ?? "沒有", standard: std[c.key] !== undefined ? showStd(c.key, std[c.key]!) : null,
    preliminary: c.preliminary, pendingNote: c.missing > 0 ? `還有 ${c.missing} 張在確認，確認後可能改變` : null,
  });
  const set = (c: CurrentCover, level: GapLevel, reason: string) => rows.set(c.key, { ...base(c), level, reason });

  // ① 重疊與儲蓄型
  const capped = new Set<GapKey>();                 // 最多到「建議補強」
  for (const [p, sec, why] of PAIRS) {
    const P = by.get(p), Sc = by.get(sec);
    if (!P || !Sc) continue;
    // 次要那格要達到門檻才算「涵蓋」主要那格（顧問 2026-10-11：長照至少 100 萬）
    const min = S.pairCoverMin[sec as keyof typeof S.pairCoverMin] ?? 0;
    const covers = has(sec) && Sc.amount >= min;
    if (covers && !has(p)) {
      set(Sc, "ok", `已經有${Sc.label} ${Sc.display}，和${P.label}性質重疊——不用兩個都做`);
      capped.add(p);
    } else if (has(sec) && has(p)) set(Sc, "ok", `現有 ${Sc.display}`);
    else if (has(sec)) set(Sc, "later", `現有 ${Sc.display}，還不到 ${wan(min)}，取代不了${P.label}——先補${P.label}`);
    else set(Sc, "later", why);
  }
  const surv = by.get("survival");
  if (surv) set(surv, has("survival") ? "ok" : "later", has("survival") ? `現有 ${surv.display}` : SAVINGS_REASON);

  // ② ～ ④
  const mustCandidates: GapKey[] = [];
  for (const c of cover) {
    if (rows.has(c.key)) continue;
    const s = std[c.key];
    if (s !== undefined && c.amount >= s) { set(c, "ok", `現有 ${c.display}，已經到 ${showStd(c.key, s)}`); continue; }
    const trig = triggers.find(t => t.key === c.key);
    // 完全沒有＋對上需求點；但還有保單在確認的，不升「一定要補」（「我明明有保」會直接失去信任，P3）
    if (!has(c.key) && trig && !capped.has(c.key) && c.missing === 0) { mustCandidates.push(c.key); continue; }
    // 「現在 X → 標準 Y」畫面上已經有，理由講「差多少」，不重複
    set(c, "boost", has(c.key)
      ? (s !== undefined ? `還差 ${showStd(c.key, s - c.amount)}` : `現有 ${c.display}，可以再加強`)
      : "目前沒有這一塊");
  }
  // 一定要補最多 maxMust 項，依需求點順序取（G6）
  const order = [...new Set(triggers.map(t => t.key))];
  mustCandidates.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  mustCandidates.forEach((k, i) => {
    const c = by.get(k)!;
    const quote = triggers.find(t => t.key === k)!.quote;
    if (i < S.maxMust) set(c, "must", `你說「${quote}」——${c.label}現在完全沒有`);
    else set(c, "boost", `目前沒有這一塊；你說「${quote}」，這項也要看，但先處理前面 ${S.maxMust} 項`);
  });

  return cover.map(c => rows.get(c.key)!).filter(Boolean);
}

/** 顧問改過的級別蓋上去（G1）。系統原判保留，讓顧問與之後的規則檢討看得到差異 */
export interface GapOverride { key: GapKey; level: GapLevel; reason: string; advisorName?: string | null; at: string }
export type FinalGapRow = GapRow & { systemLevel: GapLevel; override: GapOverride | null };

export function applyOverrides(rows: GapRow[], overrides: GapOverride[]): FinalGapRow[] {
  const latest = new Map<GapKey, GapOverride>();
  for (const o of overrides) { const cur = latest.get(o.key); if (!cur || o.at >= cur.at) latest.set(o.key, o); }
  return rows.map(r => {
    const o = latest.get(r.key);
    return o && o.level !== r.level
      ? { ...r, systemLevel: r.level, level: o.level, reason: o.reason, override: o }
      : { ...r, systemLevel: r.level, override: null };
  });
}
