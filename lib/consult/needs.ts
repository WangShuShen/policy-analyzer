/*
 * 健康路線的需求點（決議 4-ai，2026-10-12）：程式管「要問到哪些事」，AI 管「這一句怎麼講」。
 * 取代原本從原型示範劇本轉出來的固定題目——那份劇本整條假設「媽媽中風」，客戶換個來意就鬼打牆。
 *
 *   ・問的順序：來意 → 起因 →（照顧費、期間）→ 家庭 →（收入）→ 最擔心 → 既有保單
 *   ・括號內是條件題，when() 不成立就不問
 *   ・每一點都接受「不方便說」：算有答案、不再問
 *   ・READY 三點都有答案就進入「看現況」，其他沒問到也不硬問
 * 設計稿：100_Todo/projects/RADIA-v2-諮詢AI指令.md
 */

export const DECLINED = "不方便說";

export type Values = Map<string, string>;

export interface Slot {
  key: string;
  label: string;              // 右欄顯示的名稱
  ask: string;                // 給 AI 看的：這一點要問到什麼
  values: string[];           // 常見答案（整理員優先對到這些；右欄「改」的選項）
  health: boolean;            // 健康類一律不存統計級距（D2）
  editable: boolean;          // 右欄能不能改（來意決定路線，不能改）
  backup: string[];           // AI 選項連兩次被合規擋下時用的備用選項
  when?: (v: Values) => boolean;
}

// 只認「家人生病／需要照顧」；「家人過世」不能接著問照顧費（T10）
const isFamilyCare = (v: Values) => /生病|照顧/.test(v.get("trigger") ?? "") || v.has("care");
const hasDependents = (v: Values) => {
  const f = v.get("family") ?? "";
  return !!f && f !== DECLINED && !/沒有|自己|單身/.test(f);
};

export const HEALTH_SLOTS: Slot[] = [
  { key: "intent", label: "來意", ask: "他今天為什麼點進來",
    values: ["想確認現有保單夠不夠", "家裡發生了一些事", "只是先看看"], health: false, editable: false,
    backup: ["想看看保單夠不夠", "家裡發生了一些事", "只是先看看"],
    when: v => !v.has("trigger") },
  { key: "trigger", label: "起因", ask: "是什麼事讓他想到要看保單：自己身體、家人生病或需要照顧、朋友或同事出事、看到新聞，或沒有特別原因",
    values: ["自己身體出狀況", "家人生病或需要照顧", "朋友或同事出事", "看到新聞", "沒有特別原因"], health: true, editable: true,
    backup: ["家人生病了", "身邊朋友出事", "看到新聞", "沒什麼，就是想確認"],
    // 起因只是讓他開口講自己在意什麼的入口：他已經自己說出最擔心的事，就不回頭問（T11）
    when: v => !v.has("worry") },
  { key: "care_share", label: "照顧費", ask: "照顧家人的錢，現在主要是誰在出",
    values: ["獨自承擔", "跟兄弟姊妹分", "家人自己付", "還沒開始花錢"], health: false, editable: true,
    backup: ["都是我在出", "跟兄弟姊妹分", "家人自己有存款", "不太想說"], when: isFamilyCare },
  { key: "care_duration", label: "照顧期間", ask: "醫生或家人預期這樣的照顧要持續多久",
    values: ["有明確終點", "沒有明確終點，可能長期", "還不知道"], health: true, editable: true,
    backup: ["醫生說會好轉", "可能一直這樣", "還不知道", "不太想說"], when: isFamilyCare },
  { key: "family", label: "家庭", ask: "家裡有誰是靠他的（配偶、小孩幾歲、爸媽），或沒有人",
    values: ["配偶與子女", "只有配偶", "要照顧爸媽", "沒有人靠我"], health: false, editable: true,
    backup: ["另一半和小孩", "只有另一半", "爸媽", "就我自己"] },
  { key: "income_share", label: "收入結構", ask: "家裡的收入，他大概佔多少",
    values: ["主要收入來源", "雙薪，收入相當", "次要收入"], health: false, editable: true,
    backup: ["大部分靠我", "兩個人差不多", "另一半賺比較多", "不太想說"], when: hasDependents },
  { key: "worry", label: "最擔心", ask: "如果真的發生什麼事，他最擔心哪一種情況：生病沒收入、長期要人照顧、住院要花很多錢、走了家人怎麼辦（可以不只一個）",
    values: ["生病後收入中斷", "長期需要人照顧", "住院醫療費用", "身故後家人生活", "說不上來"], health: false, editable: true,
    backup: ["生病了沒收入", "老了要人照顧", "住院要花很多錢", "說不上來"] },
  { key: "existing_policy", label: "既有保單", ask: "他手上有沒有保單、知不知道保了什麼",
    values: ["有，知道內容", "有，但不清楚內容", "沒有保單", "不確定有沒有"], health: false, editable: true,
    backup: ["有，但不清楚內容", "有，大概知道", "好像沒有", "不確定"] },
];

/** 進入「看現況」要有答案的三點 */
export const READY = ["family", "worry", "existing_policy"];

export const slotOf = (key: string) => HEALTH_SLOTS.find(s => s.key === key);

/** 依順序挑出下一個該問、還沒答案的點；都問完了回 null */
export function nextSlot(v: Values): Slot | null {
  for (const s of HEALTH_SLOTS) {
    if (v.has(s.key)) continue;
    if (s.when && !s.when(v)) continue;
    return s;
  }
  return null;
}

export const needsReady = (v: Values) => READY.every(k => v.has(k));

/** 還沒答案、也該問的點（給 AI 參考，不要一次問完） */
export const stillMissing = (v: Values) => HEALTH_SLOTS.filter(s => !v.has(s.key) && (!s.when || s.when(v)));

/** 右欄與 AI 用的「已知的事」：來意：想確認保單夠不夠｜起因：沒有特別原因 */
export const knownLine = (v: Values) =>
  [...v.entries()].map(([k, x]) => `${slotOf(k)?.label ?? k}：${x}`).join("｜") || "（還沒有）";
