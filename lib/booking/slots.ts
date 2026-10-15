/*
 * 可約時段（實作設計 B2、4-ar）：顧問設「每週固定時段」＋「封鎖整天／某天某段時間」，系統切成一場一場給客戶選。
 * 純函式，不碰資料庫——同樣的設定、同樣的已約清單、同樣的「現在」，永遠算出同樣的時段。
 *
 * 時間一律以台灣時間（UTC+8，無日光節約）理解顧問的設定，存與傳一律 UTC ISO。
 */
export const SESSION_MINUTES = 120;       // 4-ar（顧問 10/14）：每場一律預留 2 小時（客戶看到「最長約 2 小時」）
export const BUFFER_MINUTES = 30;         // 4-ar：兩場之間至少空 30 分鐘（12:00–14:00 之後最早 14:30）
export const SESSION_STEP_MINUTES = 30;   // 開始時間每 30 分鐘一個選項；被約走的場次（含緩衝）擋掉附近的，不是固定整點切格
export const DAY_START = "12:00";         // 4-ar：全平台最早 12:00 開始
export const DAY_END = "22:00";           // 4-ar：最晚 22:00 結束（顧問自己的每週時段再往內縮）
export const LEAD_MINUTES = 120;          // 至少 2 小時後（同 B5 自助改期的 2 小時界線，顧問來得及先看諮詢紀錄）
export const DAYS_AHEAD = 14;

const TZ_OFFSET_MIN = 8 * 60;

export interface WeeklyRule { weekday: number; start: string; end: string }   // weekday 0＝週日；HH:MM 台灣時間
/** 封鎖：只有 date＝整天；有 start／end＝那天那段時間不能約（台灣時間） */
export interface Block { date: string; start?: string | null; end?: string | null }
/** 已經被約走的場次（UTC ISO）。用實際的起訖算衝突：舊的 40 分鐘預約照原本的長度擋 */
export interface Taken { startsAt: string; endsAt: string }
export interface Slot { startsAt: string; endsAt: string; localDate: string; localTime: string; weekday: number }

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** 台灣時間的「某日 00:00」對應的 UTC 毫秒 */
function taipeiMidnightUtc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) - TZ_OFFSET_MIN * 60_000;
}

/** UTC 時間 → 台灣時間的日期、時刻、星期 */
export function toTaipei(iso: string | number): { date: string; time: string; weekday: number } {
  const t = new Date(typeof iso === "number" ? iso : Date.parse(iso)).getTime() + TZ_OFFSET_MIN * 60_000;
  const d = new Date(t);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, weekday: d.getUTCDay() };
}

const isHHMM = (s: string) => /^\d{2}:\d{2}$/.test(s) && toMin(s) <= 24 * 60;

/** 顧問存設定時檢查：12:00 以後開始、22:00 以前結束、至少放得下一場。回傳錯誤訊息，沒問題回 null */
export function ruleProblem(r: WeeklyRule): string | null {
  if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6 || !isHHMM(r.start) || !isHHMM(r.end)) return "時段格式不對";
  if (toMin(r.start) < toMin(DAY_START)) return `最早只能從 ${DAY_START} 開始（${r.start} 太早了）`;
  if (toMin(r.end) > toMin(DAY_END)) return `最晚要在 ${DAY_END} 前結束（${r.end} 太晚了）`;
  if (toMin(r.end) - toMin(r.start) < SESSION_MINUTES) return `每個時段至少要 ${SESSION_MINUTES / 60} 小時，才放得下一場面談`;
  return null;
}
export const validRule = (r: WeeklyRule) => ruleProblem(r) === null;

/**
 * 改版前存的每週時段（例如 09:00–21:00）裁進 12:00–22:00；裁完不到 2 小時的拿掉。
 * 顧問頁讀設定時用，讓舊設定的顧問打開就能直接存（不然連改自介都會被時段檢查擋下）
 */
export function clampRules(rules: WeeklyRule[]): { rules: WeeklyRule[]; adjusted: boolean } {
  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const out = rules.flatMap(r => {
    if (!isHHMM(r.start) || !isHHMM(r.end)) return [];
    const s = Math.max(toMin(r.start), toMin(DAY_START)), e = Math.min(toMin(r.end), toMin(DAY_END));
    return e - s >= SESSION_MINUTES ? [{ weekday: r.weekday, start: fmt(s), end: fmt(e) }] : [];
  });
  return { rules: out, adjusted: out.length !== rules.length || out.some((r, i) => r.start !== rules[i].start || r.end !== rules[i].end) };
}

/** 時段型封鎖的檢查 */
export function blockProblem(b: Block): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "封鎖日期格式不對";
  if (!b.start && !b.end) return null;
  if (!b.start || !b.end || !isHHMM(b.start) || !isHHMM(b.end)) return "封鎖時段要填開始和結束";
  if (toMin(b.start) >= toMin(b.end)) return "封鎖時段的結束要晚於開始";
  return null;
}

/** 已約場次與某個候選場次是否衝突（雙方都往外加緩衝） */
const clash = (s: number, e: number, t: { s: number; e: number }) => s < t.e + BUFFER_MINUTES * 60_000 && t.s < e + BUFFER_MINUTES * 60_000;

/**
 * 產生可約時段。
 * @param blocks 顧問的封鎖（整天或某段時間，台灣時間）
 * @param taken 已經被約走的場次（只算 status=booked 的）；跟它們重疊、或離它們不到 30 分鐘的開始時間都不給
 */
export function availableSlots(rules: WeeklyRule[], blocks: Block[], taken: Taken[], now: number, days = DAYS_AHEAD): Slot[] {
  const busy = taken.map(t => ({ s: Date.parse(t.startsAt), e: Date.parse(t.endsAt) }));
  const wholeDay = new Set(blocks.filter(b => !b.start || !b.end).map(b => b.date));
  const today = toTaipei(now);
  const [y, m, d] = today.date.split("-").map(Number);
  const earliest = now + LEAD_MINUTES * 60_000;
  const out: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const midnight = taipeiMidnightUtc(y, m, d + i);
    const local = toTaipei(midnight);
    if (wholeDay.has(local.date)) continue;
    const ranges = blocks.filter(b => b.date === local.date && b.start && b.end).map(b => ({ s: toMin(b.start!), e: toMin(b.end!) }));
    const starts = new Set<number>();
    // 舊設定可能超出 12:00–22:00（改版前存的），產生時段時一律裁進範圍內，不會開出 12:00 以前的場次
    for (const r of rules.filter(r => r.weekday === local.weekday && isHHMM(r.start) && isHHMM(r.end))) {
      const from = Math.max(toMin(r.start), toMin(DAY_START)), to = Math.min(toMin(r.end), toMin(DAY_END));
      for (let t = from; t + SESSION_MINUTES <= to; t += SESSION_STEP_MINUTES) starts.add(t);
    }
    for (const t of [...starts].sort((a, b) => a - b)) {
      if (ranges.some(b => t < b.e && b.s < t + SESSION_MINUTES)) continue;   // 跟封鎖時段有任何重疊就不給
      const s = midnight + t * 60_000, e = s + SESSION_MINUTES * 60_000;
      if (s < earliest) continue;
      if (busy.some(b => clash(s, e, b))) continue;
      out.push({ startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString(), localDate: local.date, localTime: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, weekday: local.weekday });
    }
  }
  return out;
}

export const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
/** 「10 月 15 日（週三）14:00」 */
export function fmtTaipei(iso: string): string {
  const t = toTaipei(iso); const [, mm, dd] = t.date.split("-").map(Number);
  return `${mm} 月 ${dd} 日（週${WEEKDAY[t.weekday]}）${t.time}`;
}
/** 「10 月 16 日（週五）12:00–14:00」（信件用起訖，顧問 10/15） */
export function fmtRange(startsAt: string, endsAt: string): string {
  return `${fmtTaipei(startsAt)}–${toTaipei(endsAt).time}`;
}
