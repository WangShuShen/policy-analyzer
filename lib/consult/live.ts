import type { LiveContent } from "@/lib/content/store";
import type { Step } from "./script";
import type { Slot } from "./needs";

/*
 * 後台內容接線（w1b-06，卡 C 規格 10/14 04:00）：把程式裡的種子內容換成後台發布的版本。
 * 沒發布過的項目 lc.get() 會回種子，所以接上後行為不變；後台發布後 60 秒內生效（liveContent 快取）。
 *   q.line.<步驟>  固定台詞            → step.h
 *   q.opts.<步驟>  固定題目的選項文字  → step.o[i].x（只換字；數量、順序、存什麼照舊）
 *   q.slot.<需求點> 要問到什麼＋備用選項 → slot.ask／slot.backup
 *   trend.<卡>     醫療趨勢卡          → [標題, 內文, 對你的意思]
 * 試算參數直接用 lc.assumptions()（analysis.ts、gaps.ts）。
 */
export function liveStep<S extends Step>(lc: LiveContent, s: S): S {
  if (s.t === "ai") {
    const v = lc.get<{ text?: string } | undefined>(`q.line.${s.id}`);
    return v?.text ? { ...s, h: v.text } : s;
  }
  if (s.t === "ask") {
    const v = lc.get<{ options?: string[] } | undefined>(`q.opts.${s.id}`);
    if (!v?.options) return s;
    return { ...s, o: s.o.map((o, i) => ({ ...o, x: v.options![i] || o.x })) };
  }
  return s;
}

export function liveSlot(lc: LiveContent, s: Slot): Slot;
export function liveSlot(lc: LiveContent, s: Slot | null): Slot | null;
export function liveSlot(lc: LiveContent, s: Slot | null): Slot | null {
  if (!s) return null;
  const v = lc.get<{ ask?: string; backup?: string[] } | undefined>(`q.slot.${s.key}`);
  return v ? { ...s, ask: v.ask || s.ask, backup: v.backup?.length ? v.backup : s.backup } : s;
}

export function liveTrend(lc: LiveContent, k: string, seed: [string, string, string] | undefined): [string, string, string] | undefined {
  const v = lc.get<{ title?: string; body?: string; note?: string } | undefined>(`trend.${k}`);
  if (!v || !seed) return seed;
  return [v.title || seed[0], v.body || seed[1], v.note || seed[2]];
}
