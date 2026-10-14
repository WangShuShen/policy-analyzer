import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { getPlanForAdvisor, listVersions, setPlanStatus, updatePlan } from "@/lib/advisorPlan/store";
import { planErrorResponse } from "@/lib/advisorPlan/http";

/*
 * 顧問：一份保障規劃書（W4 地基 B3a）。只有建立的顧問讀得到、改得到；別人的一律 404。
 * GET [?version=n] → 完整 plan.json（含商品名，只有顧問端）＋版本清單，寫稽核 view_plan
 * PUT { plan } → 存成新的一版
 * PATCH { status } → draft／ready（已產出未解鎖）／unlocked（面談時解鎖，客戶才看得到）
 */
type Params = { params: Promise<{ planId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { planId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const v = req.nextUrl.searchParams.get("version");
  const version = v ? Number(v) : undefined;
  if (version !== undefined && !(Number.isInteger(version) && version > 0)) return NextResponse.json({ error: "version 要是正整數" }, { status: 400 });
  try {
    const out = await getPlanForAdvisor(a.advisorId, planId, version);
    return NextResponse.json({ ...out, versions: await listVersions(a.advisorId, planId) });
  } catch (e) { return planErrorResponse(e); }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { planId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const body = z.object({ plan: z.unknown() }).safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.plan === undefined) return NextResponse.json({ error: "要附上 plan（plan.json 的內容）" }, { status: 400 });
  try {
    return NextResponse.json(await updatePlan(a.advisorId, planId, body.data.plan));
  } catch (e) { return planErrorResponse(e); }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { planId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const body = z.object({ status: z.enum(["draft", "ready", "unlocked"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "status 只能是 draft、ready、unlocked" }, { status: 400 });
  try {
    return NextResponse.json(await setPlanStatus(a.advisorId, planId, body.data.status));
  } catch (e) { return planErrorResponse(e); }
}
