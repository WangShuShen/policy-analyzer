import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/db";
import { subscriptions } from "@/lib/schema";
import { requireIdentity } from "@/lib/auth";
import { isInternal } from "@/lib/plans";
import { isPlanId, PLANS } from "@/lib/plans";
import { buildSubscriptionForm, newTradeNo } from "@/lib/ecpay";

/**
 * 建立訂閱訂單，回傳綠界表單參數。
 * 前端收到後以自動送出的表單 POST 到綠界付款頁。
 */
export async function POST(req: NextRequest) {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;

  // 內部顧問本來就無限制，不需要也不應該訂閱。
  if (isInternal(auth)) {
    return NextResponse.json({ error: "內部帳號無需訂閱" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan;

  if (!isPlanId(plan) || !PLANS[plan].purchasable || PLANS[plan].monthlyPrice <= 0) {
    return NextResponse.json({ error: "方案無效或不開放線上購買" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL || req.nextUrl.origin;
  const tradeNo = newTradeNo();

  await db.insert(subscriptions).values({
    id: crypto.randomUUID(), user_id: auth.advisorId, plan, status: "pending", merchant_trade_no: tradeNo,
  });

  const { action, params } = buildSubscriptionForm({ plan, tradeNo, appUrl });
  return NextResponse.json({ action, params });
}
