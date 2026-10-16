/*
 * 諮詢的背景筆記（決議 4-au，2026-10-16；取代 4-ai 的「需求點照順序問」）：
 * 整理員把聊到的事記下來給顧問看，但不再當成關卡——問不問、問什麼由說話的人判斷。
 * 程式只守一條：同一件事不問兩次（askedBefore）。
 *
 *   ・每一項都接受「不方便說」：算有答案、不再問
 *   ・intent（來意）是 4-ai 舊對話留下的欄位（LEGACY_SLOTS），只用來顯示；新對話改記 topic（想問的事，用他的話）
 * 設計稿：100_Todo/projects/RADIA-v2-諮詢AI指令.md
 */

export const DECLINED = "不方便說";

export type Values = Map<string, string>;

export interface Slot {
  key: string;
  label: string;              // 右欄顯示的名稱
  ask: string;                // 給整理員看的：這一項要記什麼（後台可改，w1b-06）
  values: string[];           // 常見寫法（整理員優先對到這些；右欄「改」的選項）
  health: boolean;            // 健康類一律不存統計級距（D2）
  editable: boolean;          // 右欄能不能改（topic 是他的原話，不是選擇題）
  backup: string[];           // AI 選項連兩次被合規擋下時用的備用選項
  legacy?: boolean;           // 舊對話才有的欄位：只顯示，整理員不記
}

// 4-ai 舊對話留下的「來意」：只用來顯示右欄，整理員不記、後台也不列
const LEGACY_SLOTS: Slot[] = [
  { key: "intent", label: "來意", ask: "（4-ai 舊欄位）", legacy: true,
    values: ["想確認現有保單夠不夠", "家裡發生了一些事", "只是先看看"], health: false, editable: false, backup: [] },
];

export const HEALTH_SLOTS: Slot[] = [
  { key: "topic", label: "想問的事", ask: "他今天想弄清楚的事，用他的話寫，15 字內。例：理賠金比預期少、看不懂自己的保單、想幫爸媽整理保單",
    values: [], health: true, editable: false, backup: [] },   // 他的原話可能帶病況（「住院開刀沒賠」），當健康類：不存級距
  { key: "trigger", label: "起因", ask: "是什麼事讓他來問：自己身體、家人生病或需要照顧、家人過世、朋友或同事出事、看到新聞，或沒有特別原因",
    values: ["自己身體出狀況", "家人生病或需要照顧", "家人過世", "朋友或同事出事", "看到新聞", "沒有特別原因"], health: true, editable: true,
    backup: ["家人生病了", "身邊朋友出事", "看到新聞", "沒什麼，就是想確認"] },
  { key: "care_share", label: "照顧費", ask: "照顧家人的錢，現在主要是誰在出（家人需要照顧時才可能聊到）",
    values: ["獨自承擔", "跟兄弟姊妹分", "家人自己付", "還沒開始花錢"], health: false, editable: true,
    backup: ["都是我在出", "跟兄弟姊妹分", "家人自己有存款", "不太想說"] },
  { key: "care_duration", label: "照顧期間", ask: "醫生或家人預期這樣的照顧要持續多久（家人需要照顧時才可能聊到）",
    values: ["有明確終點", "沒有明確終點，可能長期", "還不知道"], health: true, editable: true,
    backup: ["醫生說會好轉", "可能一直這樣", "還不知道", "不太想說"] },
  { key: "family", label: "家庭", ask: "家裡有誰是靠他的（配偶、小孩幾歲、爸媽），或沒有人",
    values: ["配偶與子女", "只有配偶", "要照顧爸媽", "沒有人靠我"], health: false, editable: true,
    backup: ["另一半和小孩", "只有另一半", "爸媽", "就我自己"] },
  { key: "income_share", label: "收入結構", ask: "家裡的收入，他大概佔多少（只有他講到錢、收入、養家才記）",
    values: ["主要收入來源", "雙薪，收入相當", "次要收入"], health: false, editable: true,
    backup: ["大部分靠我", "兩個人差不多", "另一半賺比較多", "不太想說"] },
  { key: "worry", label: "最擔心", ask: "他自己說出最怕的情況（可以不只一個）",
    values: ["生病後收入中斷", "長期需要人照顧", "住院醫療費用", "身故後家人生活", "退休錢不夠", "錢傳給下一代會出問題", "小孩教育金", "說不上來"], health: false, editable: true,
    backup: ["生病了沒收入", "老了要人照顧", "住院要花很多錢", "說不上來"] },
  { key: "existing_policy", label: "手上保單", ask: "他手上有沒有保單、知不知道保了什麼",
    values: ["有，知道內容", "有，但不清楚內容", "沒有保單", "不確定有沒有"], health: false, editable: true,
    backup: ["有，但不清楚內容", "有，大概知道", "好像沒有", "不確定"] },
];

export const slotOf = (key: string) => HEALTH_SLOTS.find(s => s.key === key) ?? LEGACY_SLOTS.find(s => s.key === key);

/** 右欄與 AI 用的「已知的事」：想問的事：理賠金比預期少｜起因：自己住院開刀 */
export const knownLine = (v: Values) =>
  [...v.entries()].map(([k, x]) => `${slotOf(k)?.label ?? k}：${x}`).join("｜") || "（還沒有）";

/** 已經問過、或已經有答案的項目（不能再問）。asked＝之前每則 AI 回覆在問哪一項 */
export function askedBefore(v: Values, asked: string[]): Slot[] {
  const keys = new Set([...asked, ...v.keys()]);
  return HEALTH_SLOTS.filter(s => s.key !== "topic" && keys.has(s.key));
}

/** 手上有沒有保單（沒保單就不叫他傳存摺） */
export function hasPolicy(v: Values): "有" | "沒有" | "不知道" {
  const p = v.get("existing_policy") ?? "";
  if (/沒有保單|沒有$/.test(p)) return "沒有";
  if (/^有/.test(p)) return "有";
  return "不知道";
}
