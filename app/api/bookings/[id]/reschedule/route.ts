import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import { rescheduleByClient, LifecycleError } from "@/lib/booking/lifecycle";

// 客戶自助改期（B5：面談前 2 小時以前，不限次數；第 3 次起通知顧問）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  const body = z.object({ startsAt: z.string().datetime(), mode: z.enum(["online", "onsite"]).optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try { return NextResponse.json(await rescheduleByClient(who.userId, id, body.data)); }
  catch (e) { if (e instanceof LifecycleError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 }); throw e; }
}
