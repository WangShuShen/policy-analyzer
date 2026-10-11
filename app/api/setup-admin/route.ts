import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { advisors } from "@/lib/schema";
import { asc } from "drizzle-orm";

function checkSecret(req: NextRequest) {
  const secret = req.headers.get("x-setup-secret");
  return secret && secret === process.env.CRON_SECRET;
}

// List all advisors in DB (debug)
export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select({
    id: advisors.id, email: advisors.email, name: advisors.name, is_admin: advisors.is_admin, is_active: advisors.is_active,
  }).from(advisors).orderBy(asc(advisors.created_at));
  return NextResponse.json({ advisors: rows });
}

// Insert or replace an advisor
export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, name, is_admin } = await req.json();
  if (!email || !name) return NextResponse.json({ error: "email and name required" }, { status: 400 });

  // 舊版 INSERT OR REPLACE 遇到同 email 會刪掉舊列再插新列，顧問 id 因此換掉、
  // 他的審核指派全部對不上。改成同 email 就更新、id 保留。
  await db.insert(advisors)
    .values({ id: crypto.randomUUID(), email: email.toLowerCase().trim(), name: name.trim(), is_admin: is_admin ? 1 : 0, is_active: 1 })
    .onConflictDoUpdate({ target: advisors.email, set: { name: name.trim(), is_admin: is_admin ? 1 : 0, is_active: 1 } });

  return NextResponse.json({ success: true, message: `Advisor ${email} saved` });
}
