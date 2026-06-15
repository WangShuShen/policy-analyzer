import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, listAdvisors, type PolicyRow } from "@/lib/db";
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

  await ensureInit();

  const today = new Date().toISOString().slice(0, 10);

  // Get already-assigned policy UUIDs for today
  const alreadyAssigned = await db.execute({
    sql: "SELECT policy_uuid FROM policy_assignments WHERE assigned_date = ?",
    args: [today],
  });
  const assignedSet = new Set(alreadyAssigned.rows.map(r => r.policy_uuid as string));

  // Collect unassigned policies awaiting review (status='uploaded') from Turso
  const uploaded = await db.execute({
    sql: "SELECT * FROM policies WHERE status = 'uploaded' ORDER BY uploaded_at ASC, created_at ASC",
    args: [],
  });
  const pending: PolicySummary[] = uploaded.rows
    .map(r => r as unknown as PolicyRow)
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
    await db.execute({
      sql: "INSERT OR IGNORE INTO policy_assignments (id, policy_uuid, advisor_id, assigned_date, status) VALUES (?, ?, ?, ?, 'pending')",
      args: [crypto.randomUUID(), a.policyUuid, a.advisorId, today],
    });
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
