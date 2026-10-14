import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { getMyPlan } from "@/lib/advisorPlan/store";
import { planErrorResponse } from "@/lib/advisorPlan/http";

/*
 * 客戶：讀一份自己的規劃書（W4 地基 B3a）。
 * 只回客戶版（lib/advisorPlan/clientView.ts 白名單）：保障類型與建議額度，不出現商品名、公司名（4-aj）。
 * 未解鎖、別人的一律 404
 */
type Params = { params: Promise<{ planId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { planId } = await params;
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return NextResponse.json({ error: "這裡是客戶的規劃書" }, { status: 403 });
  try {
    return NextResponse.json(await getMyPlan(s.advisorId, planId));
  } catch (e) { return planErrorResponse(e); }
}
