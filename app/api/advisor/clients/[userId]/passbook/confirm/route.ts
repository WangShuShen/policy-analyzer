import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import * as passbook from "@/lib/passbook/service";
import { manualGate } from "@/lib/crm/passbookGate";

// 顧問替手動客戶確認讀到的保單清單（同客戶端 /api/passbook/confirm；只限手動客戶，見上一層）
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await manualGate(req, params);
  if (g instanceof NextResponse) return g;
  const body = z.object({
    uploadId: z.string(),
    items: z.array(z.object({
      id: z.string(), keep: z.boolean(),
      amount: z.number().nonnegative().nullable().optional(), amount_unit: z.string().max(10).nullable().optional(), plan: z.string().max(20).nullable().optional(),
    })).max(200),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "資料格式不對" }, { status: 400 });
  try {
    await passbook.confirm(g.userId, body.data.uploadId, body.data.items);
  } catch (e) {
    if (e instanceof passbook.PassbookError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  after(() => passbook.processMatch(body.data.uploadId));
  const { stuck: _s, ...v } = await passbook.view(g.userId);
  return NextResponse.json(v);
}
