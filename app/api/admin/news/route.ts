import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { approveArticle, createArticle, validate, getAdmin, listAdmin, NewsError, previewDraft, rejectArticle, submitArticle, unpublishArticle, updateArticle, withdrawArticle } from "@/lib/news/store";

// 快訊管理（W3、N3）：只有管理者能寫、能審。
// GET              → 文章清單（含後台狀態）
// GET ?id=…        → 一篇：編輯稿、檢查結果、審核紀錄
// GET ?id=…&preview=1 → 編輯稿用公開頁的資料格式（給「先看公開版長怎樣」）
// POST { action: "check", article }（只檢查不存，給編輯時即時提示）| { action: "create", article } | { action: "update", id, article } | { action: "submit" | "withdraw", id }
//      | { action: "approve", id, note? } | { action: "reject", id, note } | { action: "unpublish", id, note }
export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const sp = req.nextUrl.searchParams, id = sp.get("id");
  try {
    if (!id) return NextResponse.json({ articles: await listAdmin() });
    if (sp.get("preview") === "1") return NextResponse.json(await previewDraft(id));
    return NextResponse.json(await getAdmin(id));
  } catch (e) {
    if (e instanceof NewsError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

const Article = z.object({
  slug: z.string().max(100), title: z.string().max(200), summary: z.string().max(500), body: z.string().max(40000),
  category: z.string().max(40), cover: z.string().max(40).optional(), sources: z.string().max(1000).nullish(),
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), article: Article }),
  z.object({ action: z.literal("create"), article: Article }),
  z.object({ action: z.literal("update"), id: z.string(), article: Article }),
  z.object({ action: z.literal("submit"), id: z.string() }),
  z.object({ action: z.literal("withdraw"), id: z.string() }),
  z.object({ action: z.literal("approve"), id: z.string(), note: z.string().max(500).nullish() }),
  z.object({ action: z.literal("reject"), id: z.string(), note: z.string().max(500) }),
  z.object({ action: z.literal("unpublish"), id: z.string(), note: z.string().max(500) }),
]);

export async function POST(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  const b = p.data, me = who.advisorId;
  try {
    if (b.action === "check") return NextResponse.json(validate(b.article));
    if (b.action === "create") { const r = await createArticle(me, b.article); return NextResponse.json(r, { status: r.id ? 200 : 400 }); }
    if (b.action === "update") { const r = await updateArticle(me, b.id, b.article); return NextResponse.json(r, { status: r.saved ? 200 : 400 }); }
    if (b.action === "submit") return NextResponse.json(await submitArticle(me, b.id));
    if (b.action === "withdraw") await withdrawArticle(me, b.id);
    else if (b.action === "approve") await approveArticle(me, b.id, b.note);
    else if (b.action === "reject") await rejectArticle(me, b.id, b.note);
    else await unpublishArticle(me, b.id, b.note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NewsError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
