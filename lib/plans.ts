import type { JWTPayload } from "@/lib/jwt";
import { roleOf } from "@/lib/jwt";

export type PlanId = "free" | "basic" | "pro" | "disciple";

/** 需要計次或需要方案才能使用的動作。 */
export type Action = "analyze" | "product.detail" | "formula.trial" | "export.pdf";

export interface PlanDef {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number | null;
  /** null 代表無限制 */
  limits: Record<Action, number | null>;
  /** 對外販售；門徒方案由管理者手動開通，不公開販售 */
  purchasable: boolean;
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "免費版",
    monthlyPrice: 0,
    yearlyPrice: null,
    limits: { analyze: 1, "product.detail": 5, "formula.trial": 0, "export.pdf": 0 },
    purchasable: true,
    highlights: ["每月 1 份保單分析", "每月 5 次商品查詢", "體驗條款級解析"],
  },
  basic: {
    id: "basic",
    name: "基礎版",
    monthlyPrice: 599,
    yearlyPrice: 5990,
    limits: { analyze: 20, "product.detail": null, "formula.trial": null, "export.pdf": null },
    purchasable: true,
    highlights: ["每月 20 份保單分析", "商品查詢無限", "給付明細與公式試算", "分析結果匯出 PDF"],
  },
  pro: {
    id: "pro",
    name: "進階版",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    limits: { analyze: null, "product.detail": null, "formula.trial": null, "export.pdf": null },
    purchasable: true,
    highlights: ["保單分析無限", "商品查詢無限", "給付明細與公式試算", "分析結果匯出 PDF"],
  },
  disciple: {
    id: "disciple",
    name: "門徒方案",
    monthlyPrice: 0,
    yearlyPrice: null,
    limits: { analyze: null, "product.detail": null, "formula.trial": null, "export.pdf": null },
    purchasable: false,
    highlights: ["等同進階版全部功能", "傳燈學院課程", "由管理者開通，不對外販售"],
  },
};

export const ACTION_LABELS: Record<Action, string> = {
  analyze: "保單分析",
  "product.detail": "商品查詢",
  "formula.trial": "公式試算",
  "export.pdf": "匯出 PDF",
};

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === "free" || value === "basic" || value === "pro" || value === "disciple";
}

export function planOf(session: JWTPayload): PlanId {
  return isPlanId(session.plan) ? session.plan : "free";
}

/** 內部顧問與管理者不受訂閱方案限制。 */
export function isInternal(session: JWTPayload): boolean {
  return roleOf(session) === "advisor";
}

/**
 * 該方案對某動作的每月上限。
 * null = 無限；0 = 此方案不開放此功能。
 */
export function limitFor(plan: PlanId, action: Action): number | null {
  return PLANS[plan].limits[action];
}
