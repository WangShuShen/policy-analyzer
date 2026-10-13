import { NextRequest, NextResponse } from "next/server";
import { APPLICANT_COOKIE, ApplicationInput, ApplyError, latestApplication, readApplicant, submitApplication } from "@/lib/advisorApply";

// 顧問申請（w1b-03）。身分只認 Google 回呼發的申請憑證，不認 auth_token
// GET  → 目前是誰（沒通過 Google 驗證就是 null）＋自己最新一筆申請的狀態
// POST → 送出申請
export async function GET(req: NextRequest) {
  const who = readApplicant(req.cookies.get(APPLICANT_COOKIE)?.value);
  if (!who) return NextResponse.json({ applicant: null, application: null });
  const app = await latestApplication(who.email);
  return NextResponse.json({
    applicant: who,
    application: app && { status: app.status, name: app.name, createdAt: app.created_at, note: app.status === "rejected" ? app.review_note : null },
  });
}

export async function POST(req: NextRequest) {
  const who = readApplicant(req.cookies.get(APPLICANT_COOKIE)?.value);
  if (!who) return NextResponse.json({ error: "請先用 Google 驗證身分（30 分鐘內有效）" }, { status: 401 });
  const parsed = ApplicationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "格式不正確" }, { status: 400 });
  try {
    const row = await submitApplication(who, parsed.data);
    return NextResponse.json({ ok: true, status: row.status });
  } catch (e) {
    if (e instanceof ApplyError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
