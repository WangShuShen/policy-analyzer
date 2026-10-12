import { NextRequest, NextResponse } from "next/server";
import { requireConsultUser } from "@/lib/consult/auth";
import { listAdvisorCards, activeBooking } from "@/lib/booking/service";

// GET /api/advisors → 客戶端的顧問列表（只列約得成的顧問）
export async function GET(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const b = await activeBooking(who.userId);
  return NextResponse.json({ advisors: await listAdvisorCards(), activeBooking: b ? { id: b.id, startsAt: b.starts_at, advisorName: b.advisorName } : null });
}
