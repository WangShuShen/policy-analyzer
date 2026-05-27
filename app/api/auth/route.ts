import { NextRequest, NextResponse } from "next/server";

async function getExpectedToken(): Promise<string> {
  const secret = (process.env.SITE_PASSWORD ?? "") + ":" + (process.env.AUTH_SECRET ?? "default-secret");
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const expectedUsername = process.env.SITE_USERNAME ?? "admin";
  const expectedPassword = process.env.SITE_PASSWORD;

  if (!expectedPassword || username !== expectedUsername || password !== expectedPassword) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const token = await getExpectedToken();
  const res = NextResponse.json({ success: true });
  res.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
