/*
 * 預約時段規則（4-ar）的單元測試：純函式，不連資料庫、不打網站。
 *   npx tsx scripts/booking-rules-test.mts
 * 涵蓋：每場 2 小時、兩場之間 30 分鐘緩衝、12:00 下限、22:00 上限、時段型封鎖、整天封鎖、舊的 40 分鐘預約、提前 2 小時。
 */
import { availableSlots, blockProblem, clampRules, ruleProblem, type Taken } from "../lib/booking/slots";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond || !detail ? "" : `：${detail}`}`); };

// 「現在」＝台灣 2026-10-18（週日）10:00；測的那天是 2026-10-19（週一）
const tw = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`).toISOString();
const NOW = Date.parse(tw("2026-10-18", "10:00"));
const DAY = "2026-10-19";
const MON = (start: string, end: string) => [{ weekday: 1, start, end }];
const startsOn = (slots: ReturnType<typeof availableSlots>, date = DAY) => slots.filter(s => s.localDate === date).map(s => s.localTime);
const booked = (start: string, end: string, date = DAY): Taken => ({ startsAt: tw(date, start), endsAt: tw(date, end) });

// ── 每場 2 小時 ──
{
  const s = availableSlots(MON("12:00", "21:00"), [], [], NOW);
  const day = s.filter(x => x.localDate === DAY);
  ok("一場 2 小時", day.every(x => Date.parse(x.endsAt) - Date.parse(x.startsAt) === 120 * 60_000));
  ok("12:00–21:00 最晚 19:00 開始（結束 21:00）", startsOn(s).at(-1) === "19:00", startsOn(s).join(","));
  ok("開始時間每 30 分鐘一個", startsOn(s).slice(0, 3).join(",") === "12:00,12:30,13:00", startsOn(s).join(","));
}

// ── 30 分鐘緩衝（以實際被約走的場次計算）──
{
  const s = startsOn(availableSlots(MON("12:00", "21:00"), [], [booked("12:00", "14:00")], NOW));
  ok("12:00–14:00 被約走 → 下一場最早 14:30", s[0] === "14:30", s.join(","));
  ok("14:00 不能開（沒有緩衝）", !s.includes("14:00"));
}
{
  const s = startsOn(availableSlots(MON("12:00", "21:00"), [], [booked("16:00", "18:00")], NOW));
  ok("16:00 被約走 → 前一場最晚 13:30（13:30–15:30，空 30 分鐘）", s.includes("13:30") && !s.includes("14:00"), s.join(","));
  ok("16:00 被約走 → 後一場最早 18:30", s.includes("18:30") && !s.includes("18:00"), s.join(","));
  ok("跟已約場次重疊的開始時間都不給", !["14:00", "15:00", "16:00", "17:00"].some(t => s.includes(t)));
}
{
  // 改版前約的 40 分鐘預約照原本的長度擋
  const s = startsOn(availableSlots(MON("12:00", "22:00"), [], [booked("15:00", "15:40")], NOW));
  ok("舊的 15:00–15:40 → 前一場最晚 12:30（12:30–14:30，空 30 分鐘）", s.includes("12:30") && !s.includes("13:00"), s.join(","));
  ok("舊的 15:00–15:40 → 後一場最早 16:30（要空到 16:10，對齊 30 分鐘）", s.includes("16:30") && !s.includes("16:00"), s.join(","));
}

// ── 12:00 下限、22:00 上限 ──
ok("顧問設 11:00 開始 → 擋下並提示", (ruleProblem({ weekday: 1, start: "11:00", end: "15:00" }) ?? "").includes("12:00"), String(ruleProblem({ weekday: 1, start: "11:00", end: "15:00" })));
ok("顧問設 23:00 結束 → 擋下並提示", (ruleProblem({ weekday: 1, start: "19:00", end: "23:00" }) ?? "").includes("22:00"));
ok("不到 2 小時的時段 → 擋下", ruleProblem({ weekday: 1, start: "12:00", end: "13:30" }) !== null);
ok("12:00–22:00 → 可以", ruleProblem({ weekday: 1, start: "12:00", end: "22:00" }) === null);
{
  // 改版前存的舊設定（例如 09:00–23:00）：產生時段時裁進 12:00–22:00
  const s = startsOn(availableSlots(MON("09:00", "23:00"), [], [], NOW));
  ok("舊設定 09:00 開始也不會開出 12:00 以前的場次", s[0] === "12:00", s.join(","));
  ok("舊設定 23:00 結束也不會超過 22:00（最晚 20:00 開始）", s.at(-1) === "20:00", s.join(","));
}

{
  const c = clampRules([{ weekday: 1, start: "09:00", end: "21:00" }, { weekday: 2, start: "09:00", end: "13:00" }, { weekday: 3, start: "19:00", end: "22:00" }]);
  ok("顧問頁讀舊設定：09:00–21:00 裁成 12:00–21:00", c.rules[0]?.start === "12:00" && c.rules[0]?.end === "21:00", JSON.stringify(c.rules));
  ok("顧問頁讀舊設定：裁完不到 2 小時的（09:00–13:00）拿掉", c.rules.length === 2 && c.adjusted, JSON.stringify(c.rules));
  ok("已經符合新規則的設定不算調整", clampRules([{ weekday: 3, start: "19:00", end: "22:00" }]).adjusted === false);
}

// ── 時段型封鎖、整天封鎖 ──
{
  const s = startsOn(availableSlots(MON("12:00", "22:00"), [{ date: DAY, start: "14:00", end: "18:00" }], [], NOW));
  ok("封鎖 14:00–18:00 → 12:00 還可以（12:00–14:00 剛好不碰到）", s.includes("12:00"), s.join(","));
  ok("封鎖 14:00–18:00 → 12:30～17:30 都不給", !["12:30", "13:00", "14:00", "16:00", "17:30"].some(t => s.includes(t)), s.join(","));
  ok("封鎖 14:00–18:00 → 18:00 起又可以", s.includes("18:00"), s.join(","));
  ok("封鎖只影響那一天", startsOn(availableSlots(MON("12:00", "22:00"), [{ date: DAY, start: "14:00", end: "18:00" }], [], NOW), "2026-10-26").includes("14:00"));
}
ok("整天封鎖 → 那天一場都沒有", startsOn(availableSlots(MON("12:00", "22:00"), [{ date: DAY }], [], NOW)).length === 0);
ok("封鎖時段結束早於開始 → 擋下", blockProblem({ date: DAY, start: "18:00", end: "14:00" }) !== null);
ok("封鎖時段只填一邊 → 擋下", blockProblem({ date: DAY, start: "14:00" }) !== null);
ok("整天封鎖（不填時間）→ 可以", blockProblem({ date: DAY }) === null);

// ── 提前 2 小時 ──
{
  const now = Date.parse(tw(DAY, "13:10"));
  const s = startsOn(availableSlots(MON("12:00", "22:00"), [], [], now));
  ok("現在 13:10 → 最早 15:30（至少 2 小時後）", s[0] === "15:30", s.join(","));
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail ? 1 : 0);
