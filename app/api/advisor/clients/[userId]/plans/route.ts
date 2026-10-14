import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { createPlan, listPlansForClient } from "@/lib/advisorPlan/store";
import { planErrorResponse } from "@/lib/advisorPlan/http";

/*
 * 顧問：某位客戶的保障規劃書（W4 地基 B3a）。只能碰自己的客戶。
 * GET → 清單（不含內容）；POST { plan, status? } → 建立第 1 版，plan.json 不通過檢查回 400 並列出哪一欄錯
 */
type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { userId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json({ plans: await listPlansForClient(a.advisorId, userId) });
  } catch (e) { return planErrorResponse(e); }
}

const Body = z.object({ plan: z.unknown(), status: z.enum(["draft", "ready"]).optional() });

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.plan === undefined) return NextResponse.json({ error: "要附上 plan（plan.json 的內容）" }, { status: 400 });
  try {
    return NextResponse.json(await createPlan(a.advisorId, userId, body.data.plan, { status: body.data.status }), { status: 201 });
  } catch (e) { return planErrorResponse(e); }
}
