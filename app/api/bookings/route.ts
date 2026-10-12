import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import { book, BookingError } from "@/lib/booking/service";
import { afterBooked } from "@/lib/booking/lifecycle";

/*
 * 送出預約（B1、B2）。時段在伺服器端重新驗證（不信任瀏覽器送來的時間），
 * 兩人同時搶同一格由資料庫唯一約束擋下。回應之後才通知顧問、寄確認信（after）；信走佇列，寄失敗會重試。
 */
export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const body = z.object({ advisorId: z.string().min(1), startsAt: z.string().datetime(), mode: z.enum(["online", "onsite"]) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    const id = await book(who.userId, body.data);
    after(() => afterBooked(id).catch(e => console.error("[booking] after booked failed", id, e)));
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "slot_taken" || e.code === "already_booked" ? 409 : 400 });
    throw e;
  }
}
