import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import * as service from "@/lib/consult/service";

const Body = z.object({ conversationId: z.string().min(1), key: z.string().min(1) }).and(z.union([
  z.object({ option: z.number().int().min(0).max(20) }),
  z.object({ number: z.number().finite(), display: z.string().min(1).max(60) }),
]));

// PATCH /api/consult/fact → 右欄點開修改需求點（I5）
export async function PATCH(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  const { conversationId, key, ...change } = parsed.data;
  try {
    return NextResponse.json(await service.editFact(who.userId, conversationId, key, change as { option: number }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
