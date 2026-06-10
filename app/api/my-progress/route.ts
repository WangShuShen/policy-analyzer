import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ total: 0, completed: 0, pending: 0 });

  await ensureInit();
  const today = new Date().toISOString().slice(0, 10);

  const result = await db.execute({
    sql: "SELECT status, COUNT(*) as cnt FROM policy_assignments WHERE advisor_id = ? AND assigned_date = ? GROUP BY status",
    args: [payload.advisorId, today],
  });

  let completed = 0, pending = 0;
  for (const row of result.rows) {
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
