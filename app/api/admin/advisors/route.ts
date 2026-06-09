import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, listAdvisors } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = await verifyJWT(token);
  if (!payload?.isAdmin) return null;
  return payload;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureInit();
  const advisors = await listAdvisors();
  return NextResponse.json({ advisors });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, name, is_admin } = await req.json();

  if (!email || !name) {
    return NextResponse.json({ error: "email 和 name 為必填" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();
  await ensureInit();

  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO advisors (id, email, name, is_admin) VALUES (?, ?, ?, ?)",
    args: [id, emailLower, name.trim(), is_admin ? 1 : 0],
  });

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, is_active, is_admin, name } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id 為必填" }, { status: 400 });
  }

  await ensureInit();

  const updates: string[] = [];
  const args: (string | number)[] = [];

  if (is_active !== undefined) { updates.push("is_active = ?"); args.push(is_active ? 1 : 0); }
  if (is_admin !== undefined) { updates.push("is_admin = ?"); args.push(is_admin ? 1 : 0); }
  if (name !== undefined) { updates.push("name = ?"); args.push(name); }

  if (updates.length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE advisors SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id 為必填" }, { status: 400 });

  await ensureInit();
  await db.execute({ sql: "DELETE FROM advisors WHERE id = ?", args: [id] });
  return NextResponse.json({ success: true });
}
