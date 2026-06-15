import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, listAdvisors, type PolicyRow } from "@/lib/db";
import { sendReminderEmail, type PolicySummary } from "@/lib/mailer";

function verifySecret(req: NextRequest) {
  return req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInit();

  const today = new Date().toISOString().slice(0, 10);

  // Load policies (uuid → metadata) from Turso for product names
  const policyRows = await db.execute({ sql: "SELECT * FROM policies", args: [] });
  const registry: Record<string, PolicyRow> = {};
  for (const row of policyRows.rows) {
    const p = row as unknown as PolicyRow;
    registry[p.uuid] = p;
  }

  // Find pending (not completed) assignments for today
  const pending = await db.execute({
    sql: "SELECT * FROM policy_assignments WHERE assigned_date = ? AND status = 'pending'",
    args: [today],
  });

  if (pending.rows.length === 0) {
    return NextResponse.json({ reminded: 0, message: "all done" });
  }

  // Group by advisor
  const byAdvisor: Record<string, string[]> = {};
  for (const row of pending.rows) {
    const aid = row.advisor_id as string;
    if (!byAdvisor[aid]) byAdvisor[aid] = [];
    byAdvisor[aid].push(row.policy_uuid as string);
  }

  const advisors = await listAdvisors();
  const advisorMap = Object.fromEntries(advisors.map(a => [a.id, a]));

  const emailErrors: string[] = [];
  let reminded = 0;

  for (const [advisorId, uuids] of Object.entries(byAdvisor)) {
    const advisor = advisorMap[advisorId];
    if (!advisor) continue;

    const policies: PolicySummary[] = uuids.map(uuid => ({
      uuid,
      productName: registry[uuid]?.product_name ?? uuid,
      company: registry[uuid]?.company ?? "",
      planCode: registry[uuid]?.plan_code ?? uuid,
    }));

    try {
      await sendReminderEmail(advisor.email, advisor.name, policies, today);
      reminded++;
    } catch (err) {
      emailErrors.push(`${advisor.email}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    reminded,
    emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
  });
}
