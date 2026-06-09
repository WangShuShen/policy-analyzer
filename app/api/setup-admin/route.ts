import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";

// One-time endpoint to seed the first admin advisor.
// Protected by CRON_SECRET. Delete this file after first use.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-setup-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, name } = await req.json();
  if (!email || !name) {
    return NextResponse.json({ error: "email and name required" }, { status: 400 });
  }

  await ensureInit();

  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT OR REPLACE INTO advisors (id, email, name, is_admin, is_active) VALUES (?, ?, ?, 1, 1)",
    args: [id, email.toLowerCase().trim(), name.trim()],
  });

  return NextResponse.json({ success: true, message: `Admin ${email} created` });
}
