import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { getProfile, saveProfile, BookingError } from "@/lib/booking/service";

// 我的顧問頁（B4、B8）：專長、風格、自我介紹、會議連結、面對面地點、每週時段、封鎖日期。登錄字號由管理者設定
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  return NextResponse.json(await getProfile(a.advisorId));
}

const Body = z.object({
  specialties: z.array(z.string()).max(2), style: z.string(), intro: z.string().max(40),
  meetingLink: z.string().max(300), onsiteLocation: z.string().max(100),
  rules: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string(), end: z.string() })).max(40),
  blocked: z.array(z.string()).max(120),
});

export async function PUT(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    await saveProfile(a.advisorId, body.data);
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return NextResponse.json(await getProfile(a.advisorId));
}
