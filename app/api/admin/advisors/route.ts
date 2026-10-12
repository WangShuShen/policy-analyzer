import { NextRequest, NextResponse } from "next/server";
import db, { listAdvisors } from "@/lib/db";
import { advisors } from "@/lib/schema";
import { eq } from "drizzle-orm";
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
  return NextResponse.json({ advisors: await listAdvisors() });
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

  const id = crypto.randomUUID();
  await db.insert(advisors).values({ id, email: emailLower, name: name.trim(), is_admin: is_admin ? 1 : 0 });

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, is_active, is_admin, name, license_no } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id 為必填" }, { status: 400 });
  }

  const updates: Partial<typeof advisors.$inferInsert> = {};
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  if (is_admin !== undefined) updates.is_admin = is_admin ? 1 : 0;
  if (name !== undefined) updates.name = name;
  // 登錄字號（N20）：由管理者設定，顧問不能自己改；沒有登錄字號的顧問不會出現在客戶端的顧問列表
  if (license_no !== undefined) updates.license_no = String(license_no).trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  await db.update(advisors).set(updates).where(eq(advisors.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id 為必填" }, { status: 400 });

  await db.delete(advisors).where(eq(advisors.id, id));
  return NextResponse.json({ success: true });
}
