/*
 * 可約時段（實作設計 B2）：顧問設「每週固定時段」＋「封鎖日期」，系統切成一場一場給客戶選。
 * 純函式，不碰資料庫——同樣的設定、同樣的已約清單、同樣的「現在」，永遠算出同樣的時段。
 *
 * 時間一律以台灣時間（UTC+8，無日光節約）理解顧問的設定，存與傳一律 UTC ISO。
 */
export const SESSION_MINUTES = 40;        // 原型：「一次大約 40 分鐘」
export const SESSION_STEP_MINUTES = 60;   // 每小時一場，中間留 20 分鐘給顧問整理
export const LEAD_MINUTES = 120;          // 至少 2 小時後（同 B5 自助改期的 2 小時界線，顧問來得及先看諮詢紀錄）
export const DAYS_AHEAD = 14;

const TZ_OFFSET_MIN = 8 * 60;

export interface WeeklyRule { weekday: number; start: string; end: string }   // weekday 0＝週日；HH:MM 台灣時間
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

export function validRule(r: WeeklyRule): boolean {
  return Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 && /^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end)
    && toMin(r.start) < toMin(r.end) && toMin(r.end) <= 24 * 60 && toMin(r.end) - toMin(r.start) >= SESSION_MINUTES;
}

/**
 * 產生可約時段。
 * @param taken 已經被約走的開始時間（UTC ISO，只算 status=booked 的）
 * @param blocked 顧問封鎖的日期（台灣時間 YYYY-MM-DD）
 */
export function availableSlots(rules: WeeklyRule[], blocked: string[], taken: string[], now: number, days = DAYS_AHEAD): Slot[] {
  const takenSet = new Set(taken.map(t => new Date(t).toISOString()));
  const blockSet = new Set(blocked);
  const today = toTaipei(now);
  const [y, m, d] = today.date.split("-").map(Number);
  const earliest = now + LEAD_MINUTES * 60_000;
  const out: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const midnight = taipeiMidnightUtc(y, m, d + i);
    const local = toTaipei(midnight);
    if (blockSet.has(local.date)) continue;
    const starts = new Set<number>();
    for (const r of rules.filter(r => r.weekday === local.weekday && validRule(r))) {
      for (let t = toMin(r.start); t + SESSION_MINUTES <= toMin(r.end); t += SESSION_STEP_MINUTES) starts.add(t);
    }
    for (const t of [...starts].sort((a, b) => a - b)) {
      const s = midnight + t * 60_000;
      if (s < earliest) continue;
      const startsAt = new Date(s).toISOString();
      if (takenSet.has(startsAt)) continue;
      out.push({ startsAt, endsAt: new Date(s + SESSION_MINUTES * 60_000).toISOString(), localDate: local.date, localTime: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, weekday: local.weekday });
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
