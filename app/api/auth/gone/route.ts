import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/account/session";

// 帳號已刪除（4-aw）：清掉這台裝置的登入，回首頁。同一個 Google 帳號再登入就是全新帳號
export function GET(req: NextRequest) {
  return clearAuthCookie(NextResponse.redirect(new URL("/welcome", req.url)));
}
