import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { cancelByAdvisor, LifecycleError } from "@/lib/booking/lifecycle";

// 顧問取消（B1：原因必填，寄給客戶看；寫稽核）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  const body = z.object({ reason: z.string() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try { await cancelByAdvisor(a.advisorId, id, body.data.reason); return NextResponse.json({ ok: true }); }
  catch (e) { if (e instanceof LifecycleError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 }); throw e; }
}
