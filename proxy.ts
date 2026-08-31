import { NextRequest, NextResponse } from "next/server";
import { roleOf, verifyJWT } from "@/lib/jwt";

// Next.js 16：middleware 已更名為 proxy。
// 這裡只做「讀 cookie」的樂觀檢查（不查資料庫），細部授權與額度判斷在各 API route 內。
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

  const loginRedirect = () => {
    const url = new URL("/login", req.url);
    if (!pathname.startsWith("/api")) {
      url.searchParams.set("next", pathname + req.nextUrl.search);
    }
    return url;
  };

  if (!token) {
    return NextResponse.redirect(loginRedirect());
  }

  const payload = await verifyJWT(token);

  if (!payload) {
    const res = NextResponse.redirect(loginRedirect());
    res.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
    return res;
  }

  // 客戶（訂閱用戶）不得進入顧問的審核工作台與管理後台。
  const isAdvisorArea =
    pathname.startsWith("/review") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/review") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/my-progress") ||
    pathname.startsWith("/api/correction");

  if (roleOf(payload) === "customer" && isAdvisorArea) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "權限不足" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/catalog", req.url));
  }

  if (pathname.startsWith("/admin") && !payload.isAdmin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
