import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { hasRequiredConsent } from "@/lib/consents";

/** 諮詢 API 的守門：客戶帳號＋已同意目前版本的同意書（N4：沒同意就不能蒐集個資） */
export async function requireConsultUser(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;
  if (roleOf(auth) !== "customer") return NextResponse.json({ error: "顧問帳號不能使用客戶諮詢" }, { status: 403 });
  if (!(await hasRequiredConsent(auth.advisorId))) {
    return NextResponse.json({ error: "要先同意個資告知書", code: "consent_required" }, { status: 403 });
  }
  return { userId: auth.advisorId };
}
