import { NextRequest, NextResponse } from "next/server";
import db, { nowText } from "@/lib/db";
import { policies, policyAssignments } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { verifyJWT } from "@/lib/jwt";
import { requireAdvisor } from "@/lib/auth";

// GET /api/review/[id] → load analyzed JSON for this policy (from Turso)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdvisor(_req);
  if (guard instanceof NextResponse) return guard;
  try {
    const { id } = await params;
    const [policy] = await db.select().from(policies).where(eq(policies.uuid, id)).limit(1);
    if (!policy) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }
    if (!policy.analysis_json) {
      return NextResponse.json({ error: "此保單尚未分析" }, { status: 404 });
    }
    return NextResponse.json(JSON.parse(policy.analysis_json));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT /api/review/[id] → save edited analysis JSON to Turso (merge, keep _rawResponse etc.)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdvisor(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const { id } = await params;
    const { data } = await req.json();
    const [row] = await db.select({ analysis_json: policies.analysis_json }).from(policies)
      .where(eq(policies.uuid, id)).limit(1);
    if (!row) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }

    const existingRaw = row.analysis_json;
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const updated = { ...existing, ...data };

    await db.update(policies).set({ analysis_json: JSON.stringify(updated), updated_at: nowText })
      .where(eq(policies.uuid, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/review/[id] → archive: mark policy archived + assignment completed (pure Turso)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdvisor(req);
  if (guard instanceof NextResponse) return guard;
  try {
    const { id } = await params;
    const [found] = await db.select({ uuid: policies.uuid }).from(policies).where(eq(policies.uuid, id)).limit(1);
    if (!found) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    await db.update(policies).set({ status: "archived", archived_at: today, updated_at: nowText })
      .where(eq(policies.uuid, id));

    // Mark today's assignment for the current advisor as completed
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;
    if (payload) {
      await db.update(policyAssignments).set({ status: "completed", completed_at: nowText })
        .where(and(
          eq(policyAssignments.policy_uuid, id),
          eq(policyAssignments.advisor_id, payload.advisorId),
          eq(policyAssignments.assigned_date, today),
        ));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
