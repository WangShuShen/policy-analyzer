import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { audit } from "@/lib/consult/gaps";
import { isMyClient } from "@/lib/crm/store";
import { PassbookError, setInsured } from "@/lib/passbook/service";

/*
 * 顧問改一張保單的被保險人：本人／家人（顧問定案 10/16：只算被保險人是本人的保單；AI 看不出來的標「待確認」，由顧問確認）。
 * 只能改自己的客戶（同缺口改級的 isMyClient）；每次改都寫稽核紀錄（N12）。改完客戶端與顧問端的全險圖、缺口都會重新算。
 */
type Params = { params: Promise<{ userId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { userId } = await params;
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  if (!(await isMyClient(a.advisorId, userId))) return NextResponse.json({ error: "這位客戶不是你的客戶" }, { status: 403 });
  const body = z.object({ policyId: z.string().min(1).max(64), owner: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    await setInsured(userId, body.data.policyId, body.data.owner, a.advisorId);
  } catch (e) {
    if (e instanceof PassbookError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
  await audit(a.advisorId, body.data.owner ? "set_insured_self" : "set_insured_family", userId, "client_policy", body.data.policyId);
  return NextResponse.json({ ok: true });
}
