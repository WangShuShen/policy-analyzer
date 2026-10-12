import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import * as service from "@/lib/consult/service";

// 民眾端的輸入是不可信來源，一律先驗證格式（設計準則 Q1：zod）
const Body = z.object({
  conversationId: z.string().min(1),
  stepId: z.string().min(1),
}).and(z.union([
  z.object({ option: z.number().int().min(0).max(20) }),
  z.object({ text: z.string().min(1).max(1000) }),
  z.object({ skipUpload: z.literal(true) }),
  z.object({ uploaded: z.literal(true) }),
]));

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  const { conversationId, ...input } = parsed.data;
  try {
    return NextResponse.json(await service.turn(who.userId, conversationId, input as service.TurnInput));
  } catch (e) {
    if (e instanceof service.StaleTurnError) {
      return NextResponse.json({ error: e.message, code: "stale", snapshot: await service.open(who.userId, conversationId) }, { status: 409 });
    }
    console.error("[consult/turn]", e);
    return NextResponse.json({ error: "這一句沒送出去，請再試一次" }, { status: 500 });
  }
}
