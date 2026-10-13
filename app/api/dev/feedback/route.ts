import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { addFeedback, isDevSite, listFeedback, updateFeedback, KINDS, STATUSES } from "@/lib/devFeedback";

/*
 * 開發版回饋 API（卡 A 第 4 步）。不是開發版（RADIA_ENV≠dev）一律 404——上線版看不到、也送不進來。
 *   GET ?probe=1  → 回饋鈕載入時問「這裡是開發版嗎、我是誰」（不用登入）
 *   GET           → 回饋清單（要登入）
 *   POST          → 送出回饋（不用登入：落地頁、同意書頁也要能回報）
 *   PATCH         → 改狀態／處理說明（顧問、管理者）
 */
const notFound = () => new NextResponse("Not found", { status: 404 });

async function who(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return { role: "guest", userId: null as string | null, name: null as string | null };
  const r = roleOf(s);
  return { role: r === "advisor" ? (s.isAdmin ? "admin" : "advisor") : "customer", userId: s.advisorId, name: s.name ?? null };
}

export async function GET(req: NextRequest) {
  if (!isDevSite()) return notFound();
  const me = await who(req);
  if (req.nextUrl.searchParams.get("probe")) return NextResponse.json({ enabled: true, role: me.role, name: me.name });
  if (me.role === "guest") return NextResponse.json({ error: "請先登入" }, { status: 401 });
  return NextResponse.json({ items: await listFeedback(), canEdit: me.role === "advisor" || me.role === "admin" });
}

export async function POST(req: NextRequest) {
  if (!isDevSite()) return notFound();
  const body = z.object({
    kind: z.enum(Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]]),
    body: z.string().trim().min(1, "請寫一句說明").max(2000),
    pageUrl: z.string().max(500),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "格式不正確" }, { status: 400 });
  const me = await who(req);
  const r = await addFeedback({ ...body.data, role: me.role, userId: me.userId, userName: me.name });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest) {
  if (!isDevSite()) return notFound();
  const me = await who(req);
  if (me.role !== "advisor" && me.role !== "admin") return NextResponse.json({ error: "只有顧問或管理者能改狀態" }, { status: 403 });
  const body = z.object({
    id: z.string().min(1),
    status: z.enum(Object.keys(STATUSES) as [keyof typeof STATUSES, ...(keyof typeof STATUSES)[]]).optional(),
    handlerNote: z.string().max(1000).nullable().optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  await updateFeedback(body.data.id, { status: body.data.status, handlerNote: body.data.handlerNote });
  return NextResponse.json({ ok: true });
}
