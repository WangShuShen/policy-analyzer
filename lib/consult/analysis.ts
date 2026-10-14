import db from "@/lib/db";
import { analysisSnapshots, bookings } from "@/lib/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { encryptJson, decryptJson } from "@/lib/fieldCrypto";
import { liveContent } from "@/lib/content/store";
import { computeAll, inputsFromFacts, type CalcInputs, type CalcResults } from "@/lib/calc/engine";
import type { StoredFact } from "./store";
import type { PassbookView } from "@/lib/passbook/service";
import { computeGaps } from "./gaps";
import type { FinalGapRow } from "@/lib/calc/gaps";

/*
 * 「我的分析」與對話右欄的資料（原型 v37 dPanelSetup／SCREENS.analysis、4-i、4-ah）。
 *
 * 鎖：事實層（現況、位置、開銷、遺產稅試算、流程）一律看得到；判讀與建議要顧問標記「已面談」才解鎖——預約不算。
 * 原型用模糊遮住鎖住的區塊，但模糊的 HTML 還是在畫面裡、打開開發者工具就看得到。
 * 這裡改成：鎖住的區塊內容根本不送出伺服器，只送標題與已經公開的總數。
 */

export type PanelKey = "now" | "gaps" | "sum" | "route" | "exp" | "retgap" | "taxest" | "proc" | "taxsrc" | "survgap" | "xfer" | "edugap" | "fsum";

const OPEN = new Set<PanelKey>(["now", "route", "exp", "taxest", "proc"]);
// 我的分析：依「事實 → 判讀」排；鎖住的永遠在下面
export const PAGE_ORDER: PanelKey[] = ["now", "route", "exp", "taxest", "proc", "gaps", "retgap", "taxsrc", "survgap", "xfer", "edugap", "sum", "fsum"];

export const PANEL_TITLE: Record<PanelKey, [string, string]> = {
  now: ["你現在的保障", "保單合併"], gaps: ["該補什麼", "四級優先 ＋ 建議值"], sum: ["方向確認與保費試算", ""],
  route: ["你現在的位置", ""], exp: ["你現在每個月花在哪裡", "你說的"], retgap: ["退休缺口", "含通膨試算"],
  taxest: ["遺產稅試算", "示意"], proc: ["走完流程要多久", "保守估 10 個月"], taxsrc: ["稅源缺口", "含遺族過渡期"],
  survgap: ["遺族長期保障缺口", "年收倍數法"], xfer: ["生前贈與 vs 繼承", "兩條路對照"], edugap: ["教育金", "時間成本對照"],
  fsum: ["下一步", ""],
};

// 該補什麼、保費試算：要有保單，而且缺口分級與建議值的規則還沒定（N18 只定了四級，沒定怎麼判）→ 面談時由顧問整理
const NEEDS_POLICIES = new Set<PanelKey>(["gaps", "sum"]);

export type PanelData =
  | { key: "route"; r: CalcResults["route"] }
  | { key: "exp"; r: ExpView; assumed: string[] }
  | { key: "retgap"; r: CalcResults["retirement"]; assumed: string[] }
  | { key: "taxest"; r: EstView; assumed: string[] }
  | { key: "proc"; months: number }
  | { key: "taxsrc"; r: CalcResults["taxSource"]; assumed: string[] }
  | { key: "survgap"; r: CalcResults["survivor"]; layer1: number; months: number; assumed: string[]; life: PassbookView["lifeCover"] }
  | { key: "xfer"; r: CalcResults["transfer"] }
  | { key: "edugap"; r: CalcResults["education"] }
  | { key: "fsum"; facts: number; hasPolicies: boolean }
  | { key: "now"; passbook: Omit<PassbookView, "lifeCover"> | null }      // 你現在的保障：存摺讀出來的全險圖
  | { key: "gaps" | "sum"; needsPolicies: true; hasPolicies: boolean }
  | { key: "gaps"; rows: ClientGapRow[] }                                   // 該補什麼（G1–G8，顧問核過）
  | { key: "sum"; must: string[]; boost: string[] };                        // 方向確認：只列方向，不列保費（G4）

/** 給客戶看的分級：不帶系統原判與顧問姓名以外的內部資訊 */
export type ClientGapRow = Omit<FinalGapRow, "systemLevel" | "override"> & { adjusted: boolean };

/*
 * 看得到的區塊只帶它自己畫得出來的欄位。
 * 「開銷」跟「退休缺口」是同一份計算結果——整份送出去的話，鎖住的缺口與每月多存就夾帶在開銷區塊裡了。
 */
type R = CalcResults["retirement"];
export type ExpView = Pick<R, "food" | "home" | "homeRet" | "trans" | "transRet" | "fun" | "medical" | "baseNow" | "baseRet">;
export type EstView = Pick<CalcResults["estate"], "est" | "deductions" | "deductTotal" | "net" | "tax" | "children">;
const pickKeys = <T extends object, K extends keyof T>(o: T, ks: K[]): Pick<T, K> =>
  Object.fromEntries(ks.map(k => [k, o[k]])) as Pick<T, K>;

export interface AnalysisView {
  unlocked: boolean;
  booking: { status: "booked" | "met"; startsAt: string } | null;
  open: PanelData[];
  locked: { key: PanelKey; title: string; hint: string }[];
  headlines: { key: PanelKey; label: string; value: string; note?: string }[];     // 鎖卡上「已算出」的總數（原型 4-i）；note＝數字旁的試算基準
  assumptionsVersion: string;
}

/** 解鎖＝這位客戶有任何一筆被顧問標為「已面談」的預約（B1：由 bookings 推導，不另存） */
async function bookingState(userId: string): Promise<AnalysisView["booking"]> {
  const rows = await db.select({ status: bookings.status, starts_at: bookings.starts_at }).from(bookings)
    .where(and(eq(bookings.user_id, userId), inArray(bookings.status, ["booked", "met"])))
    .orderBy(desc(bookings.starts_at));
  const met = rows.find(r => r.status === "met");
  if (met) return { status: "met", startsAt: met.starts_at };
  const booked = rows.find(r => r.status === "booked");
  return booked ? { status: "booked", startsAt: booked.starts_at } : null;
}

const wan = (n: number) => `${Math.round(n / 10000).toLocaleString()} 萬`;

/*
 * 4-ap（顧問 10/14）：面談前客戶端不出現工具類型（投資型、變額年金……），只講路線。
 * 配置邏輯照 4-ad 算（lib/calc/engine.ts route），顧問端與面談解鎖後看完整版；客戶端換掉「工具」和提到工具的說明。
 */
function routeForClient(R: CalcResults["route"]): CalcResults["route"] {
  const why: Record<string, string> = {
    "成長型累積": `離退休還有 ${R.yrsLeft} 年，<b>中間跌了有時間漲回來</b>。而且你說願意承受波動，這段時間可以多看重成長。`,
    "穩健型累積": `時間夠（還有 ${R.yrsLeft} 年），但你說<b>不想虧到本金</b>。那就以穩為主——<b>規劃要配合人，不是人配合規劃</b>。`,
  };
  return { ...R, why: why[R.main] ?? R.why, tools: [] };
}

function panelData(key: PanelKey, r: CalcResults, factCount: number, pb: PassbookView | null, gaps: FinalGapRow[] | null, unlocked = true): PanelData | null {
  const hasPolicies = pb?.upload?.status === "done" && pb.counts.counted > 0;
  if (key === "gaps" && gaps) return { key, rows: gaps.map(({ systemLevel: _s, override, ...g }) => ({ ...g, adjusted: !!override })) };
  if (key === "sum" && gaps) return { key, must: gaps.filter(g => g.level === "must").map(g => g.label), boost: gaps.filter(g => g.level === "boost").map(g => g.label) };
  if (NEEDS_POLICIES.has(key)) return { key: key as "gaps" | "sum", needsPolicies: true, hasPolicies };
  switch (key) {
    case "now": {
      if (!pb?.upload) return { key, passbook: null };
      const { lifeCover: _l, ...rest } = pb;
      return { key, passbook: rest };
    }
    case "route": return { key, r: unlocked ? r.route : routeForClient(r.route) };
    case "exp": return { key, r: pickKeys(r.retirement, ["food", "home", "homeRet", "trans", "transRet", "fun", "medical", "baseNow", "baseRet"]), assumed: r.assumed.retirement };
    case "retgap": return { key, r: r.retirement, assumed: r.assumed.retirement };
    case "taxest": return { key, r: pickKeys(r.estate, ["est", "deductions", "deductTotal", "net", "tax", "children"]), assumed: r.assumed.estate };
    case "proc": return { key, months: r.taxSource.months };
    case "taxsrc": return { key, r: r.taxSource, assumed: [...r.assumed.estate, ...r.assumed.taxSource] };
    case "survgap": return { key, r: r.survivor, layer1: r.taxSource.gap, months: r.taxSource.months, assumed: r.assumed.survivor, life: pb?.lifeCover ?? null };
    case "xfer": return { key, r: r.transfer };
    case "edugap": return { key, r: r.education };
    case "fsum": return { key, facts: factCount, hasPolicies };
  }
  return null;
}

/**
 * 依對話裡出現過的區塊算出右欄／我的分析。
 * @param shown 對話裡出現過的區塊（依出現順序）；page=true 時依 PAGE_ORDER 重排
 */
export async function buildAnalysis(userId: string, facts: StoredFact[], shown: string[], page = false, pb: PassbookView | null = null,
  opts: { forAdvisor?: boolean } = {}): Promise<AnalysisView & { inputs: CalcInputs; results: CalcResults }> {
  const A = (await liveContent()).assumptions();     // 後台發布、已生效的試算參數（w1b-06、E4）；沒發布過就是種子
  const inputs = inputsFromFacts(facts);
  // 現有壽險：存摺讀好了就帶入（遺族缺口的「− 現有壽險」），沒有就以 0 計並標示
  if (pb?.lifeCover) inputs.lifeCoverExisting = pb.lifeCover.amount;
  const results = computeAll(inputs, A);         // 客戶端一律 0% 報酬（E2）
  const booking = await bookingState(userId);
  // 顧問看的是完整版（他就是要當面說明的人），不受客戶端的鎖影響；數字與客戶解鎖後看到的完全相同
  const unlocked = opts.forAdvisor || booking?.status === "met";
  // 缺口分級只在畫面上真的有「該補什麼／方向確認」時才算（要讀全部需求點與顧問改級）
  const needGaps = shown.some(k => k === "gaps" || k === "sum");
  const gaps = needGaps ? await computeGaps(userId, pb, inputs.inc !== undefined ? results.survivor.longNeed : null) : null;

  const keys = (page ? PAGE_ORDER.filter(k => shown.includes(k)) : (shown.filter(k => k in PANEL_TITLE) as PanelKey[]));
  const uniq = [...new Set(keys)];
  const open: PanelData[] = [];
  const locked: AnalysisView["locked"] = [];
  for (const k of uniq) {
    if (unlocked || OPEN.has(k)) { const d = panelData(k, results, facts.length, pb, gaps, unlocked); if (d) open.push(d); }
    else locked.push({ key: k, title: PANEL_TITLE[k][0], hint: PANEL_TITLE[k][1] });
  }
  const headlines: AnalysisView["headlines"] = [];
  if (!unlocked) {
    const lk = new Set(locked.map(l => l.key));
    if (lk.has("gaps") && gaps) headlines.push({ key: "gaps", label: "保障缺口", value: `${gaps.filter(g => g.level === "must").length} 項一定要補` });
    if (lk.has("retgap")) headlines.push({ key: "retgap", label: "退休缺口", value: wan(results.retirement.gap) });
    if (lk.has("taxsrc")) headlines.push({ key: "taxsrc", label: "稅源缺口", value: wan(results.taxSource.gap) });
    // 4-ap：倍數不由 AI 講，寫成數字旁的試算基準（4-ae 照樣用年收倍數算）
    if (lk.has("survgap")) headlines.push({ key: "survgap", label: "遺族保障缺口", value: wan(results.survivor.longGap), note: `試算基準：年收入 × ${results.survivor.mult}，僅供參考` });
  }
  return { unlocked, booking, open, locked, headlines, assumptionsVersion: A.version, inputs, results };
}

/** 對外的版本：拿掉原始輸入與完整結果（鎖住的數字不能藏在 JSON 裡送出去） */
export function publicView(a: AnalysisView & { inputs?: unknown; results?: unknown }): AnalysisView {
  const { unlocked, booking, open, locked, headlines, assumptionsVersion } = a;
  return { unlocked, booking, open, locked, headlines, assumptionsVersion };
}

const oneYearLater = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); };

/**
 * 每次輸入或參數版本變了就存一份快照（E1、E4）。同樣的輸入不重複存。
 * 快照是之後「我的規劃」差異說明（E5）的比較基準，也讓舊分析不會因參數改版而變數字。
 */
export async function saveSnapshotIfChanged(userId: string, convId: string, inputs: CalcInputs, results: CalcResults): Promise<boolean> {
  if (Object.keys(inputs).length === 0) return false;
  const [last] = await db.select().from(analysisSnapshots)
    .where(and(eq(analysisSnapshots.conversation_id, convId), eq(analysisSnapshots.source, "ai")))
    .orderBy(desc(analysisSnapshots.seq)).limit(1);
  if (last && last.assumptions_version === results.assumptionsVersion &&
      JSON.stringify(decryptJson(last.inputs_enc)) === JSON.stringify(sortKeys(inputs))) return false;
  await db.insert(analysisSnapshots).values({
    id: crypto.randomUUID(), user_id: userId, conversation_id: convId, source: "ai",
    inputs_enc: encryptJson(sortKeys(inputs)), results_enc: encryptJson(results),
    assumptions_version: results.assumptionsVersion, expires_at: oneYearLater(),
  });
  return true;
}

const sortKeys = (o: CalcInputs) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
