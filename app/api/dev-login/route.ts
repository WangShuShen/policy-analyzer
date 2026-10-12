import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { users, advisors } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { signJWT } from "@/lib/jwt";
import { recordConsent } from "@/lib/consents";
import { timingSafeEqual } from "node:crypto";

/*
 * ⚠️ 測試用的一鍵登入。兩種情況才會動，其他一律 404：
 *   ①本機：DEV_LOGIN=1 而且從 localhost 連進來
 *   ②開發版：DEV_LOGIN=1、RADIA_ENV=dev，而且網址帶對 key（DEV_LOGIN_KEY，只設在開發版）
 * 上線版永遠不設 DEV_LOGIN／RADIA_ENV／DEV_LOGIN_KEY（設計準則 §4：上線版永遠不開測試登入）。
 */
function allowed(req: NextRequest): boolean {
  if (process.env.DEV_LOGIN !== "1") return false;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.get("host") ?? "")) return true;
  const want = process.env.DEV_LOGIN_KEY ?? "", got = req.nextUrl.searchParams.get("key") ?? "";
  return process.env.RADIA_ENV === "dev" && want.length >= 32 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
export async function GET(req: NextRequest) {
  if (!allowed(req)) return new NextResponse("Not found", { status: 404 });
  const as = req.nextUrl.searchParams.get("as");
  const id = req.nextUrl.searchParams.get("id");
  let payload: Parameters<typeof signJWT>[0], to: string;
  if (as === "new-customer") {
    const uid = `demo-${Date.now()}`;
    await db.insert(users).values({ id: uid, email: `${uid}@example.invalid`, name: "測試客戶" });
    await recordConsent(uid, { marketing: false });
    payload = { advisorId: uid, email: `${uid}@example.invalid`, name: "測試客戶", isAdmin: false, role: "customer", plan: "free" }; to = "/consult";
  } else if (as === "customer" && id) {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) return new NextResponse("no such user", { status: 404 });
    payload = { advisorId: u.id, email: u.email, name: u.name ?? "客戶", isAdmin: false, role: "customer", plan: "free" }; to = "/me";
  } else if ((as === "advisor" || as === "admin") && id) {
    const [a] = await db.select().from(advisors).where(eq(advisors.id, id)).limit(1);
    if (!a) return new NextResponse("no such advisor", { status: 404 });
    payload = { advisorId: a.id, email: a.email, name: a.name, isAdmin: as === "admin", role: "advisor", plan: "free" }; to = "/todo";
  } else return new NextResponse("bad request", { status: 400 });
  const res = NextResponse.redirect(new URL(to, req.url));
  res.cookies.set("auth_token", await signJWT(payload), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/" });
  return res;
}
