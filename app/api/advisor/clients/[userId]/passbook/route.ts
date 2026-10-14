import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { manualGate } from "@/lib/crm/passbookGate";
import * as passbook from "@/lib/passbook/service";

/*
 * 顧問幫「手動建的客戶」上傳保險存摺（w2-01、4-f：自己談來的客戶也要能用存摺、分析）。
 * 只限 source=manual 而且建立時勾了「已取得客戶同意」（4-aq）；平台客戶由本人上傳，顧問不能代傳。
 * 解析流程跟客戶端完全一樣（lib/passbook/service），PDF 一樣在瀏覽器端解鎖，身分證字號不經過伺服器。
 */
export const maxDuration = 300;

const Content = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), pages: z.array(z.string().max(60_000)).min(1).max(40) }),
  z.object({ kind: z.literal("images"), images: z.array(z.object({ mime: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(1_500_000) })).min(1).max(10) }),
]);

const pub = (v: Awaited<ReturnType<typeof passbook.view>>) => { const { stuck: _s, ...rest } = v; return rest; };

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await manualGate(req, params);
  if (g instanceof NextResponse) return g;
  const v = await passbook.view(g.userId);
  if (v.stuck) { const { id, stage } = v.stuck; after(() => stage === "read" ? passbook.processRead(id).then(() => {}) : passbook.processMatch(id)); }
  return NextResponse.json(pub(v));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await manualGate(req, params);
  if (g instanceof NextResponse) return g;
  const body = z.object({ conversationId: z.string().nullable().optional(), content: Content }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "檔案格式不對，請重新選擇" }, { status: 400 });
  try {
    const id = await passbook.createUpload(g.userId, null, body.data.content);
    after(() => passbook.processRead(id).then(() => {}));
    return NextResponse.json(pub(await passbook.view(g.userId)));
  } catch (e) {
    if (e instanceof passbook.PassbookError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
