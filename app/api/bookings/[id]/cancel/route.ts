import { NextRequest, NextResponse } from "next/server";
import { requireConsultUser } from "@/lib/consult/auth";
import { cancelByClient, LifecycleError } from "@/lib/booking/lifecycle";

// 客戶自助取消（B5：面談前 2 小時以前）。通知顧問、寄信給雙方
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireConsultUser(req);
  if (who instanceof NextResponse) return who;
  const { id } = await params;
  try { await cancelByClient(who.userId, id); return NextResponse.json({ ok: true }); }
  catch (e) { if (e instanceof LifecycleError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 }); throw e; }
}
