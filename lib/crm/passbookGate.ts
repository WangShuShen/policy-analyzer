import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth";
import { relation } from "./store";

/** 顧問代傳存摺的守門：只限自己建、而且勾了「已取得客戶同意」的手動客戶（w2-01、4-aq） */
export async function manualGate(req: NextRequest, params: Promise<{ userId: string }>) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const { userId } = await params;
  const r = await relation(a.advisorId, userId);
  if (!r || r.source !== "manual" || !r.consent_at) return NextResponse.json({ error: "只有你自己建、而且已勾選客戶同意的客戶，才能由你上傳保單" }, { status: 403 });
  return { advisorId: a.advisorId, userId };
}

