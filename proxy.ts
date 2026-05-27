import { NextRequest, NextResponse } from "next/server";

async function getExpectedToken(): Promise<string> {
  const secret = (process.env.SITE_PASSWORD ?? "") + ":" + (process.env.AUTH_SECRET ?? "default-secret");
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行 Next.js 內部路徑
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;
  const expected = await getExpectedToken();

  if (token !== expected) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
