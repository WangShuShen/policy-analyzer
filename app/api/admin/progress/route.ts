import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, listAdvisors } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureInit();

  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const [advisors, assignments] = await Promise.all([
    listAdvisors(),
    db.execute({
      sql: "SELECT advisor_id, status, COUNT(*) as cnt FROM policy_assignments WHERE assigned_date = ? GROUP BY advisor_id, status",
      args: [date],
    }),
  ]);

  // Build stats map
  const statsMap: Record<string, { pending: number; completed: number }> = {};
  for (const row of assignments.rows) {
    const aid = row.advisor_id as string;
    if (!statsMap[aid]) statsMap[aid] = { pending: 0, completed: 0 };
    if (row.status === "completed") statsMap[aid].completed = Number(row.cnt);
    else statsMap[aid].pending += Number(row.cnt);
  }

  const result = advisors
    .filter(a => a.is_active === 1)
    .map(a => {
      const s = statsMap[a.id] ?? { pending: 0, completed: 0 };
      const total = s.pending + s.completed;
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        is_admin: a.is_admin,
        total,
        completed: s.completed,
        pending: s.pending,
      };
    });

  return NextResponse.json({ date, advisors: result });
}
