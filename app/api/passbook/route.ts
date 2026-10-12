import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import { getConversation } from "@/lib/consult/store";
import * as passbook from "@/lib/passbook/service";

/*
 * 保險存摺（實作設計 P1–P4）。
 * 瀏覽器先用客戶輸入的身分證字號解鎖 PDF，只把解鎖後的文字或截圖送上來——身分證字號不會經過這裡。
 * 讀清單、對版本都在回應之後背景跑（P2），對話不用等。
 */
export const maxDuration = 300;

const Content = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), pages: z.array(z.string().max(60_000)).min(1).max(40) }),
  z.object({ kind: z.literal("images"), images: z.array(z.object({
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(1_500_000),
  })).min(1).max(10) }),
]);

const publicView = (v: Awaited<ReturnType<typeof passbook.view>>) => { const { stuck: _s, ...rest } = v; return rest; };

// 卡住太久的重新排進背景（函式逾時、部署中斷）
function resumeIfStuck(v: Awaited<ReturnType<typeof passbook.view>>) {
  if (!v.stuck) return;
  const { id, stage } = v.stuck;
  after(() => stage === "read" ? passbook.processRead(id).then(() => {}) : passbook.processMatch(id));
}

// GET /api/passbook → 最近一份存摺的狀態、讀到的保單、合併後的全險圖
export async function GET(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const v = await passbook.view(who.userId);
  resumeIfStuck(v);
  return NextResponse.json(publicView(v));
}

// POST /api/passbook → 上傳（已解鎖的內容）
export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const body = z.object({ conversationId: z.string().nullable().optional(), content: Content }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "檔案格式不對，請重新選擇" }, { status: 400 });
  const convId = body.data.conversationId && (await getConversation(who.userId, body.data.conversationId)) ? body.data.conversationId : null;
  try {
    const id = await passbook.createUpload(who.userId, convId, body.data.content);
    after(() => passbook.processRead(id).then(() => {}));
    return NextResponse.json(publicView(await passbook.view(who.userId)));
  } catch (e) {
    if (e instanceof passbook.PassbookError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
