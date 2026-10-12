import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { inbox, markRead } from "@/lib/notify/inbox";

// 顧問的站內通知：GET 列最近 30 則＋未讀數；POST 標已讀（給 ids 只標那幾則，不給就全部）
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  return NextResponse.json(await inbox({ type: "advisor", id: a.advisorId }));
}

export async function POST(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const body = z.object({ ids: z.array(z.string()).max(100).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  await markRead({ type: "advisor", id: a.advisorId }, body.data.ids);
  return NextResponse.json({ ok: true });
}
