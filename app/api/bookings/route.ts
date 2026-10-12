import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import { book, bookingDetail, BookingError } from "@/lib/booking/service";
import { sendBookingEmails } from "@/lib/booking/mail";
import { view as passbookView } from "@/lib/passbook/service";

/*
 * 送出預約（B1、B2）。時段在伺服器端重新驗證（不信任瀏覽器送來的時間），
 * 兩人同時搶同一格由資料庫唯一約束擋下。確認信在回應之後寄（after），寄失敗不影響預約。
 */
export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const body = z.object({ advisorId: z.string().min(1), startsAt: z.string().datetime(), mode: z.enum(["online", "onsite"]) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    const id = await book(who.userId, body.data);
    after(async () => {
      const d = await bookingDetail(who.userId, id);
      const pb = await passbookView(who.userId);
      if (d) await sendBookingEmails(d, { hasPassbook: pb.upload?.status === "done" });
    });
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "slot_taken" || e.code === "already_booked" ? 409 : 400 });
    throw e;
  }
}
