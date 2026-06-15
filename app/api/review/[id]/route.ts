import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, type PolicyRow } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

// GET /api/review/[id] → load analyzed JSON for this policy (from Turso)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await ensureInit();
    const r = await db.execute({ sql: "SELECT * FROM policies WHERE uuid = ?", args: [id] });
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }
    const policy = r.rows[0] as unknown as PolicyRow;
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
  try {
    const { id } = await params;
    const { data } = await req.json();
    await ensureInit();

    const r = await db.execute({ sql: "SELECT analysis_json FROM policies WHERE uuid = ?", args: [id] });
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }

    const existingRaw = r.rows[0].analysis_json as string | null;
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const updated = { ...existing, ...data };

    await db.execute({
      sql: "UPDATE policies SET analysis_json = ?, updated_at = datetime('now') WHERE uuid = ?",
      args: [JSON.stringify(updated), id],
    });

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
  try {
    const { id } = await params;
    await ensureInit();

    const r = await db.execute({ sql: "SELECT uuid FROM policies WHERE uuid = ?", args: [id] });
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "找不到此保單" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    await db.execute({
      sql: "UPDATE policies SET status = 'archived', archived_at = ?, updated_at = datetime('now') WHERE uuid = ?",
      args: [today, id],
    });

    // Mark today's assignment for the current advisor as completed
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;
    if (payload) {
      await db.execute({
        sql: "UPDATE policy_assignments SET status = 'completed', completed_at = datetime('now') WHERE policy_uuid = ? AND advisor_id = ? AND assigned_date = ?",
        args: [id, payload.advisorId, today],
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
