import { and, eq, gte, inArray } from "drizzle-orm";
import db from "@/lib/db";
import { viewEvents } from "@/lib/schema";
import { listClients, type ClientRow } from "@/lib/advisor/clients";
import { hidden, todoStatesOf } from "./store";
import { fmtTaipei, toTaipei } from "@/lib/booking/slots";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * 顧問首頁待辦（原型 SCREENS.advhome，w2-03）：告訴新人「現在做什麼」。
 *   需要現在處理：還沒看諮詢紀錄、今天的面談、剛面談完還沒標記
 *   這週：面談完超過 12 小時還沒記錄、下次追蹤日到了
 *   提示 · 不用急：客戶又打開了「我的分析」（w2-04 的開啟追蹤；不是任務，不能關）
 * 每件待辦有一個 key，延後／關掉記在 todo_states；同一位客戶換了預約或追蹤日就是新的待辦，會重新出現。
 */
export type Level = "r" | "o" | "y" | "g" | "b";
export interface TodoItem { key: string; group: "now" | "week" | "hint"; lv: Level; userId: string; name: string; title: string; detail: string; at: string; act: string; href: string }

const HINT_HOURS = 72;

/** 客戶打開「我的分析」的紀錄（今天面談的副標、回訪提示） */
async function viewsOf(userIds: string[], sinceMs: number) {
  if (!userIds.length) return new Map<string, { n: number; last: string; top: string | null; ms: number }>();
  const since = new Date(sinceMs).toISOString().slice(0, 19).replace("T", " ");
  const rows = await db.select().from(viewEvents).where(and(inArray(viewEvents.user_id, userIds), eq(viewEvents.page, "analysis"), gte(viewEvents.created_at, since)));
  const m = new Map<string, { n: number; last: string; top: string | null; ms: number }>();
  for (const r of rows) {
    const cur = m.get(r.user_id) ?? { n: 0, last: "", top: null, ms: 0 };
    cur.n++; cur.ms += r.duration_ms ?? 0;
    if (r.created_at > cur.last) {
      cur.last = r.created_at;
      try { const s = JSON.parse(r.sections ?? "[]") as { key: string; label?: string; ms: number }[]; const best = s.sort((a, b) => b.ms - a.ms)[0]; cur.top = best ? best.label ?? best.key : cur.top; } catch { /* 壞資料就略過 */ }
    }
    m.set(r.user_id, cur);
  }
  return m;
}

const mins = (ms: number) => ms < 60_000 ? "不到 1 分鐘" : `${Math.round(ms / 60_000)} 分鐘`;

export async function buildTodos(advisorId: string, now = Date.now()) {
  const rows = await listClients(advisorId, now);
  const today = toTaipei(now).date;
  const views = await viewsOf(rows.map(r => r.userId), now - 30 * 86400e3);
  const items: TodoItem[] = [];
  const href = (c: ClientRow, q = "") => `/clients/${c.userId}${q}`;
  for (const c of rows) {
    const v = views.get(c.userId);
    if (c.status === "面談完結果還沒記錄") items.push({ key: `unmarked:${c.bookingId}`, group: "week", lv: "y", userId: c.userId, name: c.name, title: `${fmtTaipei(c.startsAt!).replace(/（.*/, "")} 面談完，結果還沒記錄`, detail: "沒記錄的話客戶端不會解鎖，後續追蹤也會接不上", at: c.startsAt!, act: "記錄結果", href: href(c) });
    else if (c.status === "面談結束了，記得標記結果") items.push({ key: `unmarked:${c.bookingId}`, group: "now", lv: "r", userId: c.userId, name: c.name, title: "剛面談完，記得標記結果", detail: "標「已面談」客戶的完整分析才會解鎖", at: c.startsAt!, act: "記錄結果", href: href(c) });
    else if (c.status === "還沒看諮詢紀錄") items.push({ key: `unread:${c.bookingId}`, group: "now", lv: "r", userId: c.userId, name: c.name, title: `預約了 ${fmtTaipei(c.startsAt!)}，你還沒看他的諮詢紀錄`, detail: c.source, at: c.startsAt!, act: "看他的背景", href: href(c, "?tab=chat") });
    else if (c.bookingId && (c.group === "upcoming" || c.group === "todo") && c.startsAt && toTaipei(c.startsAt).date === today && now < Date.parse(c.startsAt))
      items.push({ key: `today:${c.bookingId}`, group: "now", lv: "o", userId: c.userId, name: c.name, title: `今天 ${fmtTaipei(c.startsAt).replace(/^.*?）/, "")} 面談`,
        detail: v ? `客戶看過「我的分析」${v.n} 次${v.top ? `，在「${v.top}」停最久` : ""}` : `${c.source} · 還沒打開過「我的分析」`, at: c.startsAt, act: "開客戶頁", href: href(c) });
    // 下次追蹤日到了（w2-02 設的）
    if (c.followUpOn && c.followUpOn <= today && c.group !== "won" && c.group !== "lost")
      items.push({ key: `followup:${c.userId}:${c.followUpOn}`, group: c.followUpOn < today ? "now" : "week", lv: "g", userId: c.userId, name: c.name,
        title: c.followUpOn < today ? `追蹤日 ${c.followUpOn.slice(5).replace("-", "/")} 過了，還沒聯絡` : "今天要追蹤", detail: c.followUpNote ?? "到客戶頁記下這次聯絡，再設下一次追蹤日", at: `${c.followUpOn}T00:00:00+08:00`, act: "開客戶頁", href: href(c, "?tab=sum") });
    // 回訪提示：最近 72 小時打開過「我的分析」（今天要面談的已經寫在副標，不重複）
    if (v && Date.parse(v.last.replace(" ", "T") + "Z") > now - HINT_HOURS * 3600e3 && !items.some(x => x.userId === c.userId && x.key.startsWith("today:")))
      items.push({ key: `hint:${c.userId}:${v.last.slice(0, 10)}`, group: "hint", lv: "b", userId: c.userId, name: c.name, title: "又打開了「我的分析」",
        detail: `最近 30 天看了 ${v.n} 次、共 ${mins(v.ms)}${v.top ? `，在「${v.top}」停最久` : ""}`, at: v.last.replace(" ", "T") + "Z", act: "開客戶頁", href: href(c) });
  }
  const states = await todoStatesOf(advisorId);
  const live = items.filter(x => x.group === "hint" || !hidden(states.get(x.key), now));
  // 已處理的（今天關掉的，或正在延後中的）：顯示「已處理 N 件」＋還原
  const todayUtc = new Date(Date.parse(`${taipeiDay(now)}T00:00:00+08:00`)).toISOString().slice(0, 19).replace("T", " ");
  const handled = items.flatMap(x => {
    const st = states.get(x.key);
    if (x.group === "hint" || !st || !hidden(st, now)) return [];
    if (st.dismissedAt && st.dismissedAt < todayUtc) return [];
    return [{ key: x.key, name: x.name, title: x.title, reason: st.reason, snoozedUntil: st.snoozedUntil }];
  });
  return { items: live, handled, total: rows.length };
}

/** 導覽列待辦數：需要現在處理的件數 */
export async function nowCount(advisorId: string) {
  return (await buildTodos(advisorId)).items.filter(x => x.group === "now").length;
}

