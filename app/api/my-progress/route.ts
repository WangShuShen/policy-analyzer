import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { policyAssignments } from "@/lib/schema";
import { and, count, eq } from "drizzle-orm";
import { verifyJWT } from "@/lib/jwt";
import { requireAdvisor } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireAdvisor(req);
  if (guard instanceof NextResponse) return guard;
  const token = req.cookies.get("auth_token")?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ total: 0, completed: 0, pending: 0 });

  const today = new Date().toISOString().slice(0, 10);

  const result = await db.select({ status: policyAssignments.status, cnt: count() })
    .from(policyAssignments)
    .where(and(eq(policyAssignments.advisor_id, payload.advisorId), eq(policyAssignments.assigned_date, today)))
    .groupBy(policyAssignments.status);

  let completed = 0, pending = 0;
  for (const row of result) {
    if (row.status === "completed") completed = Number(row.cnt);
    else pending += Number(row.cnt);
  }

  return NextResponse.json({
    total: completed + pending,
    completed,
    pending,
    advisorName: payload.name,
    date: today,
  });
}
