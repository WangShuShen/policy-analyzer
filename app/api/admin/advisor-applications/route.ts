import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApplyError, approveApplication, listApplications, rejectApplication } from "@/lib/advisorApply";

// 顧問申請審核（w1b-03）：只有管理者。所屬公司、手機只在這裡出現（4-aj）
export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  return NextResponse.json({ applications: await listApplications(status) });
}

const Body = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  const { id, action, note } = parsed.data;
  try {
    if (action === "approve") return NextResponse.json({ ok: true, ...(await approveApplication(id, who.advisorId, note)) });
    await rejectApplication(id, who.advisorId, note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ApplyError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
