import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { currentPeriod, getUsage } from "@/lib/entitlements";
import { isInternal, limitFor, planOf, PLANS, type Action } from "@/lib/plans";

const ACTIONS: Action[] = ["analyze", "product.detail", "formula.trial", "export.pdf"];

/** 供前端顯示「本月還剩幾次」與是否該提示升級。 */
export async function GET(req: NextRequest) {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const period = currentPeriod();

  if (isInternal(auth)) {
    return NextResponse.json({
      internal: true,
      plan: null,
      period,
      items: ACTIONS.map(action => ({ action, used: 0, limit: null, remaining: null })),
    });
  }

  const plan = planOf(auth);
  const usage = await getUsage(auth.advisorId, period);

  return NextResponse.json({
    internal: false,
    plan,
    planName: PLANS[plan].name,
    period,
    items: ACTIONS.map(action => {
      const limit = limitFor(plan, action);
      const used = usage[action] ?? 0;
      return {
        action,
        used,
        limit,
        remaining: limit === null ? null : Math.max(0, limit - used),
      };
    }),
  });
}
