import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { users, advisors } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { signJWT } from "@/lib/jwt";
import { recordConsent } from "@/lib/consents";

/*
 * ⚠️ 本機測試用的一鍵登入。只有環境變數 DEV_LOGIN=1 而且從 localhost 連進來才會動，
 * 正式與預覽環境不會設這個變數（設了也會因為不是 localhost 而回 404）。上線前會整支刪掉。
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (process.env.DEV_LOGIN !== "1" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return new NextResponse("Not found", { status: 404 });
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
