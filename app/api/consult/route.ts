import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultUser } from "@/lib/consult/auth";
import * as service from "@/lib/consult/service";
import { listConversations } from "@/lib/consult/store";

// GET /api/consult            → 最近一段沒聊完的對話（沒有就開新的）
// GET /api/consult?id=…       → 打開某段對話
// GET /api/consult?list=1     → 過去的對話清單（4-x）
export async function GET(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const sp = req.nextUrl.searchParams;
  if (sp.get("list") === "1") {
    const rows = await listConversations(who.userId);
    return NextResponse.json({ conversations: rows.map(c => ({ id: c.id, title: c.title ?? "這次的對話", status: c.status, lastActiveAt: c.last_active_at })) });
  }
  const id = sp.get("id");
  return NextResponse.json(id ? await service.open(who.userId, id) : await service.resumeLatest(who.userId));
}

// POST /api/consult → 開一段新的對話
export async function POST(req: NextRequest) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  z.object({}).passthrough().parse(await req.json().catch(() => ({})));
  return NextResponse.json(await service.open(who.userId, null));
}
