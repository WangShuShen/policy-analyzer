import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/api/setup-admin" ||
    pathname === "/api/admin/seed-drive" ||
    pathname === "/login" ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|otf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyJWT(token);

  if (!payload) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
    return res;
  }

  if (pathname.startsWith("/admin") && !payload.isAdmin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
