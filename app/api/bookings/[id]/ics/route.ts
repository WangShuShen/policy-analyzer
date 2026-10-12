import { NextRequest, NextResponse } from "next/server";
import { requireConsultUser } from "@/lib/consult/auth";
import { bookingDetail } from "@/lib/booking/service";
import { bookingIcs } from "@/lib/booking/ics";
import { fmtTaipei } from "@/lib/booking/slots";

// 「加入行事曆」：下載這筆預約的 .ics（只能下載自己的）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const b = await bookingDetail(who.userId, id);
  if (!b) return NextResponse.json({ error: "找不到這筆預約" }, { status: 404 });
  const where = b.mode === "online" ? b.advisor.meetingLink : b.advisor.onsiteLocation;
  const ics = bookingIcs({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, summary: `RADIA 面談：${b.advisor.name} 顧問`,
    description: `${fmtTaipei(b.startsAt)}｜${b.mode === "online" ? "線上視訊" : "面對面"}${where ? `｜${where}` : ""}`, location: where, url: b.mode === "online" ? b.advisor.meetingLink : null });
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="radia-meeting.ics"` } });
}
