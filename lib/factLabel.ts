import { STEPS } from "@/lib/consult/script";
import { slotOf } from "@/lib/consult/needs";

/**
 * 需求點的中文名稱（family → 家庭、income_share → 收入結構…）。
 * 跟 lib/consult/service.ts factMeta 同一套規則：先找保障路線的需求欄位（needs.ts），再找舊步驟的選項。
 * 顧問客戶頁「他在對話裡說的」、客戶 /analysis「你說的事」共用；10/15 截圖發現兩邊只查舊步驟，新欄位顯示成英文。
 */
export function factLabel(key: string): string {
  const slot = slotOf(key);
  if (slot) return slot.label;
  for (const s of STEPS) if (s.t === "ask" && s.keys.includes(key)) return s.o.find(o => o.key === key)?.label ?? key;
  return key;
}
