import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import * as passbook from "@/lib/passbook/service";

// 客戶確認讀到的清單（P1 ②）：可刪掉已解約的、可改保額。只是事實確認，不碰條款（N1）
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const body = z.object({
    uploadId: z.string(),
    items: z.array(z.object({
      id: z.string(), keep: z.boolean(),
      amount: z.number().nonnegative().nullable().optional(), amount_unit: z.string().max(10).nullable().optional(), plan: z.string().max(20).nullable().optional(),
    })).max(200),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "資料格式不對" }, { status: 400 });
  try {
    await passbook.confirm(who.userId, body.data.uploadId, body.data.items);
  } catch (e) {
    if (e instanceof passbook.PassbookError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  after(() => passbook.processMatch(body.data.uploadId));
  const { stuck: _s, ...v } = await passbook.view(who.userId);
  return NextResponse.json(v);
}
