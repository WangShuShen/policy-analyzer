import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listLogins, onlineNow } from "@/lib/admin/logins";
import { checkAlerts, setThresholds, Thresholds, usageSummary } from "@/lib/admin/usage";

// GET → 後台監控（w1b-04、w1b-05）：誰在線、最近登入、AI 用量與費用、警報。打開時順便檢查一次警報
export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  await checkAlerts();
  const [online, logins, usage] = await Promise.all([onlineNow(), listLogins({ limit: 100 }), usageSummary()]);
  return NextResponse.json({ online, logins, usage });
}

// PUT { monthlyBudgetUsd, userDailyUsd } → 改警報門檻（寫稽核）
export async function PUT(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const p = Thresholds.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "門檻要是大於 0 的數字" }, { status: 400 });
  await setThresholds(who.advisorId, p.data);
  return NextResponse.json({ ok: true, thresholds: p.data });
}
