import { NextRequest, NextResponse } from "next/server";
import { runBookingCron } from "@/lib/booking/lifecycle";

/*
 * 預約排程（W1b）：面談前一天／前 1 小時的提醒＋寄信佇列重試。
 * 每 10 分鐘由 GitHub Actions 呼叫（.github/workflows/booking-cron.yml），帶 x-cron-secret。重複呼叫是安全的。
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runBookingCron());
}
