import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";

function checkSecret(req: NextRequest) {
  const secret = req.headers.get("x-setup-secret");
  return secret && secret === process.env.CRON_SECRET;
}

// List all advisors in DB (debug)
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureInit();
  const result = await db.execute("SELECT id, email, name, is_admin, is_active FROM advisors ORDER BY created_at");
  return NextResponse.json({ advisors: result.rows });
}

// Insert or replace an advisor
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, name, is_admin } = await req.json();
  if (!email || !name) return NextResponse.json({ error: "email and name required" }, { status: 400 });

  await ensureInit();
  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT OR REPLACE INTO advisors (id, email, name, is_admin, is_active) VALUES (?, ?, ?, ?, 1)",
    args: [id, email.toLowerCase().trim(), name.trim(), is_admin ? 1 : 0],
  });

  return NextResponse.json({ success: true, message: `Advisor ${email} saved` });
}
