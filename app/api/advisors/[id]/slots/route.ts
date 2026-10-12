import { NextRequest, NextResponse } from "next/server";
import { requireConsultUser } from "@/lib/consult/auth";
import { advisorCard, advisorSlotsFor } from "@/lib/booking/service";

// GET /api/advisors/[id]/slots → 這位顧問未來 14 天可約的時段（台灣時間）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const card = await advisorCard(id);
  if (!card) return NextResponse.json({ error: "這位顧問目前沒有開放預約" }, { status: 404 });
  return NextResponse.json({ advisor: card, slots: await advisorSlotsFor(id) });
}
