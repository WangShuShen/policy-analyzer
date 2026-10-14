import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { auditAdminView, DataRequestError, listAdmin, updateRequest } from "@/lib/mydata/store";

// 個資申請（4-ap、N5）：只有管理者。GET 清單（打開就留一筆查閱紀錄）；POST { id, status: "processing" | "done", note }
export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const requests = await listAdmin(open ? ["received", "processing"] : undefined);
  await auditAdminView(who.advisorId);
  return NextResponse.json({ requests });
}

const Body = z.object({ id: z.string(), status: z.enum(["processing", "done"]), note: z.string().max(2000) });

export async function POST(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    await updateRequest(who.advisorId, p.data.id, p.data.status, p.data.note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DataRequestError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
