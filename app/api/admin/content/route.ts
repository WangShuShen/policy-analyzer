import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { cancelScheduled, ContentError, discardDraft, itemDetail, listItems, previewPublish, publish, saveDraft } from "@/lib/content/store";

// 後台內容管理（w1b-06）：只有管理者。
// GET            → 所有可改的項目（分組、是否改過、有沒有草稿）
// GET ?id=…      → 一個項目：種子、上線版、草稿、排程中的參數、版本歷史
// GET ?id=…&preview=1 → 發布前預覽（草稿跟上線版的差異＋檢查）
// POST { id, action: "save", body, source, sourceYear, effectiveFrom, note } | { id, action: "publish" | "discard" } | { action: "cancel", versionId }
export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const sp = req.nextUrl.searchParams, id = sp.get("id");
  try {
    if (!id) return NextResponse.json({ items: await listItems() });
    if (sp.get("preview") === "1") return NextResponse.json(await previewPublish(id));
    return NextResponse.json(await itemDetail(id));
  } catch (e) {
    if (e instanceof ContentError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string(), body: z.unknown(), source: z.string().max(300).nullish(), sourceYear: z.string().max(10).nullish(),
    effectiveFrom: z.string().max(10).nullish(), note: z.string().max(300).nullish() }),
  z.object({ action: z.literal("publish"), id: z.string() }),
  z.object({ action: z.literal("discard"), id: z.string() }),
  z.object({ action: z.literal("cancel"), versionId: z.string() }),
]);

export async function POST(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  const b = p.data;
  try {
    if (b.action === "save") {
      const r = await saveDraft(who.advisorId, b.id, { ...b, body: b.body ?? null });
      return NextResponse.json(r, { status: r.errors.length ? 400 : 200 });
    }
    if (b.action === "publish") await publish(who.advisorId, b.id);
    else if (b.action === "discard") await discardDraft(who.advisorId, b.id);
    else await cancelScheduled(who.advisorId, b.versionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ContentError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
