import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db";
import { users } from "@/lib/schema";

/*
 * 帳號刪除後的登入（4-aw）：登入憑證 7 天有效，客戶在 A 手機刪帳號，B 電腦的憑證還沒過期。
 * 客戶頁面的守門發現帳號不在了 → 導到 /api/auth/gone 清掉登入、回首頁（伺服器元件不能直接改 cookie）。
 */
export const GONE_PATH = "/api/auth/gone";

export async function userExists(userId: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)).length > 0;
}

export function clearAuthCookie<T extends NextResponse>(res: T): T {
  res.cookies.set("auth_token", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}
