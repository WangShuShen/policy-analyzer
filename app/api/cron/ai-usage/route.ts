import { NextRequest, NextResponse } from "next/server";
import { checkAlerts } from "@/lib/admin/usage";

// POST /api/cron/ai-usage（x-cron-secret）→ 檢查 AI 用量警報（w1b-05、I6）。掛在 booking-cron 每 10 分鐘那支
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ fired: await checkAlerts() });
}
