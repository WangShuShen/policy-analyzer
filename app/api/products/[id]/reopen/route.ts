import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";
import { requireAdvisor } from "@/lib/auth";
import db, { nowText, descNullsLast } from "@/lib/db";
import { policies, policyAssignments } from "@/lib/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import crypto from "crypto";

type Params = { params: Promise<{ id: string }> };

// POST /api/products/[id]/reopen — 把已歸檔商品送回審核佇列（id = planCode）
// 將 policy status 改回 uploaded、指派給目前顧問，回傳 uuid 供前端跳轉編輯頁
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireAdvisor(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const { id } = await params;
    const planCode = decodeURIComponent(id);
    const [found] = await db.select({ uuid: policies.uuid }).from(policies)
      .where(and(eq(policies.plan_code, planCode), isNotNull(policies.analysis_json)))
      .orderBy(descNullsLast(policies.archived_at), desc(policies.updated_at))
      .limit(1);
    if (!found) {
      return NextResponse.json({ error: "找不到此商品的分析紀錄" }, { status: 404 });
    }
    const uuid = found.uuid;

    await db.update(policies).set({ status: "uploaded", archived_at: null, updated_at: nowText })
      .where(eq(policies.uuid, uuid));

    // 指派給目前顧問（沒登入就略過指派，仍可由 /review/[uuid] 直接編輯）
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;
    if (payload) {
      const today = new Date().toISOString().slice(0, 10);
      const mine = and(eq(policyAssignments.policy_uuid, uuid), eq(policyAssignments.advisor_id, payload.advisorId));
      const exists = await db.select({ id: policyAssignments.id }).from(policyAssignments).where(mine).limit(1);
      if (exists.length === 0) {
        await db.insert(policyAssignments).values({
          id: crypto.randomUUID(), policy_uuid: uuid, advisor_id: payload.advisorId, assigned_date: today, status: "pending",
        });
      } else {
        await db.update(policyAssignments).set({ status: "pending", completed_at: null }).where(mine);
      }
    }

    return NextResponse.json({ success: true, uuid });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
