import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { viewEvents } from "@/lib/schema";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";

/*
 * 開啟追蹤（W2 w2-04，通用）。只記客戶本人的瀏覽；顧問、管理者打開不記。
 * POST { action: "open", page, refId } → { id }；POST { action: "update", id, durationMs, sections }（離開頁面時 sendBeacon 送來）
 */
const PAGES = ["analysis", "plan"] as const;
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), page: z.enum(PAGES), refId: z.string().max(80).nullable() }),
  z.object({ action: z.literal("update"), id: z.string().max(80), durationMs: z.number().int().nonnegative(),
    sections: z.array(z.object({ key: z.string().max(40), ms: z.number().int().nonnegative() })).max(30) }),
]);
const MAX_MS = 4 * 3600_000;   // 分頁開著忘了關，最多算 4 小時

export async function POST(req: NextRequest) {
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return new NextResponse(null, { status: 204 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "格式不對" }, { status: 400 });
  const b = p.data, userId = s.advisorId;
  if (b.action === "open") {
    const id = crypto.randomUUID();
    await db.insert(viewEvents).values({ id, user_id: userId, page: b.page, ref_id: b.refId });
    return NextResponse.json({ id });
  }
  const sections = b.sections.map(x => ({ key: x.key, ms: Math.min(x.ms, MAX_MS) }));
  await db.update(viewEvents).set({ duration_ms: Math.min(b.durationMs, MAX_MS), sections: JSON.stringify(sections), updated_at: nowText })
    .where(and(eq(viewEvents.id, b.id), eq(viewEvents.user_id, userId)));
  return new NextResponse(null, { status: 204 });
}
