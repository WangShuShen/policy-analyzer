// 快訊的固定清單（後台畫面也用，所以不 import 任何伺服器端的東西）
export const CATEGORIES = ["實用教學", "健保與政策", "理賠觀念", "家庭規劃"] as const;
export const COVERS = ["i-doc", "i-money", "i-done", "i-kid", "i-elder", "i-chart", "i-cal", "i-lock", "i-radar", "i-p2"] as const;
export const LIMITS = { title: 40, summary: 120, body: 20000, sources: 500 };
