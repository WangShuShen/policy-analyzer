import { NextRequest, NextResponse } from "next/server";
import db, { listAdvisors, ascNullsFirst } from "@/lib/db";
import { policies, policyAssignments } from "@/lib/schema";
import { asc, eq, or } from "drizzle-orm";
import { sendDailyAssignment, type PolicySummary } from "@/lib/mailer";

const DAILY_LIMIT = 20;

function verifySecret(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  return secret === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // 排除「已經有未完成指派」的保單。
  // 舊版只排除 assigned_date = today，導致昨天以前指派、顧問還沒審完的保單
  // 每天 08:00 又被重新指派一次，policy_assignments 因此累積大量重複列。
  const alreadyAssigned = await db.selectDistinct({ policy_uuid: policyAssignments.policy_uuid })
    .from(policyAssignments)
    .where(or(eq(policyAssignments.status, "pending"), eq(policyAssignments.assigned_date, today)));
  const assignedSet = new Set(alreadyAssigned.map(r => r.policy_uuid));

  // Collect unassigned policies awaiting review (status='uploaded') from Turso
  const uploaded = await db.select().from(policies).where(eq(policies.status, "uploaded"))
    .orderBy(ascNullsFirst(policies.uploaded_at), asc(policies.created_at));
  const pending: PolicySummary[] = uploaded
    .filter(p => !assignedSet.has(p.uuid))
    .map(p => ({
      uuid: p.uuid,
      productName: p.product_name ?? "",
      company: p.company ?? "",
      planCode: p.plan_code ?? p.uuid,
    }));

  if (pending.length === 0) {
    return NextResponse.json({ assigned: 0, message: "no pending policies" });
  }

  // Get active non-admin advisors
  const allAdvisors = await listAdvisors();
  const activeAdvisors = allAdvisors.filter(a => a.is_active === 1);

  if (activeAdvisors.length === 0) {
    return NextResponse.json({ assigned: 0, message: "no active advisors" });
  }

  // Round-robin assignment — up to DAILY_LIMIT per advisor
  const assignments: { policyUuid: string; advisorId: string; advisorIdx: number }[] = [];
  let advisorIdx = 0;
  const advisorCount: Record<string, number> = {};

  for (const policy of pending) {
    // Find next advisor with room
    let tries = 0;
    while (tries < activeAdvisors.length) {
      const advisor = activeAdvisors[advisorIdx % activeAdvisors.length];
      const count = advisorCount[advisor.id] ?? 0;
      if (count < DAILY_LIMIT) {
        assignments.push({ policyUuid: policy.uuid, advisorId: advisor.id, advisorIdx: advisorIdx % activeAdvisors.length });
        advisorCount[advisor.id] = count + 1;
        advisorIdx++;
        break;
      }
      advisorIdx++;
      tries++;
    }
    if (tries >= activeAdvisors.length) break; // all advisors full
  }

  // Write assignments to DB
  for (const a of assignments) {
    await db.insert(policyAssignments).values({
      id: crypto.randomUUID(), policy_uuid: a.policyUuid, advisor_id: a.advisorId, assigned_date: today, status: "pending",
    }).onConflictDoNothing();
  }

  // Send email to each advisor with their list
  const emailErrors: string[] = [];
  for (const advisor of activeAdvisors) {
    const myPolicies = assignments
      .filter(a => a.advisorId === advisor.id)
      .map(a => pending.find(p => p.uuid === a.policyUuid)!)
      .filter(Boolean);

    if (myPolicies.length === 0) continue;

    try {
      await sendDailyAssignment(advisor.email, advisor.name, myPolicies, today);
    } catch (err) {
      emailErrors.push(`${advisor.email}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    assigned: assignments.length,
    advisors: activeAdvisors.length,
    emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
  });
}
