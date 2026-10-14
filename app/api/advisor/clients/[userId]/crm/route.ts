import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { addInteraction, CrmError, deleteInteraction, isMyClient, listInteractions, relation, setFollowUp, setOutcome, updateManualClient } from "@/lib/crm/store";

// 客戶頁的客戶管理（W2：w2-01、w2-02）。只能動自己的客戶
// GET → 關係（來源、結果、下次追蹤、手動客戶資料）＋互動紀錄
// POST { action: "interaction", kind, day, summary } | { action: "delete_interaction", id } | { action: "follow_up", day|null, note }
//      | { action: "outcome", outcome, note } | { action: "profile", name, phone, note }（只限手動客戶）
async function gate(req: NextRequest, params: Promise<{ userId: string }>) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const { userId } = await params;
  if (!(await isMyClient(a.advisorId, userId))) return NextResponse.json({ error: "這不是你的客戶" }, { status: 404 });
  return { advisorId: a.advisorId, userId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await gate(req, params);
  if (g instanceof NextResponse) return g;
  const r = await relation(g.advisorId, g.userId);
  return NextResponse.json({
    relation: r && { source: r.source, outcome: r.outcome, outcomeNote: r.outcome_note, followUpOn: r.follow_up_on, followUpNote: r.follow_up_note, phone: r.phone, note: r.note, consentAt: r.consent_at },
    interactions: await listInteractions(g.advisorId, g.userId),
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("interaction"), kind: z.enum(["meeting", "proposal", "call", "note"]), day: z.string().max(10), summary: z.string().max(2000) }),
  z.object({ action: z.literal("delete_interaction"), id: z.string() }),
  z.object({ action: z.literal("follow_up"), day: z.string().max(10).nullable(), note: z.string().max(400).nullish() }),
  z.object({ action: z.literal("outcome"), outcome: z.enum(["open", "won", "lost"]), note: z.string().max(400).nullish() }),
  z.object({ action: z.literal("profile"), name: z.string().max(100), phone: z.string().max(40).nullish(), note: z.string().max(1000).nullish() }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const g = await gate(req, params);
  if (g instanceof NextResponse) return g;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "資料格式不對" }, { status: 400 });
  const b = p.data, { advisorId, userId } = g;
  try {
    if (b.action === "interaction") return NextResponse.json({ id: await addInteraction(advisorId, userId, b.kind, b.day, b.summary) });
    if (b.action === "delete_interaction") await deleteInteraction(advisorId, userId, b.id);
    else if (b.action === "follow_up") await setFollowUp(advisorId, userId, b.day, b.note);
    else if (b.action === "outcome") await setOutcome(advisorId, userId, b.outcome, b.note);
    else await updateManualClient(advisorId, userId, b);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CrmError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
