import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { listMyPlans } from "@/lib/advisorPlan/store";

// 客戶：我的保障規劃書清單（W4 地基 B3a）。只列已解鎖的（4-i：面談時顧問解鎖）
export async function GET(req: NextRequest) {
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return NextResponse.json({ error: "這裡是客戶的規劃書" }, { status: 403 });
  return NextResponse.json({ plans: await listMyPlans(s.advisorId) });
}
