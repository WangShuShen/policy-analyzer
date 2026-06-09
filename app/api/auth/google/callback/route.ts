import { NextRequest, NextResponse } from "next/server";
import { getAdvisorByEmail } from "@/lib/db";
import { signJWT } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const loginUrl = (error: string) =>
    new URL(`/login?error=${error}`, req.url);

  if (oauthError || !code) {
    return NextResponse.redirect(loginUrl("oauth_failed"));
  }

  const storedState = req.cookies.get("oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(loginUrl("invalid_state"));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback";

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(loginUrl("token_exchange_failed"));
  }

  const tokens = await tokenRes.json();

  // Get user info
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return NextResponse.redirect(loginUrl("userinfo_failed"));
  }

  const userInfo = await userInfoRes.json();
  const email = userInfo.email as string;

  // Check if email is in the advisors allowlist
  const advisor = await getAdvisorByEmail(email);

  if (!advisor) {
    return NextResponse.redirect(loginUrl("not_authorized"));
  }

  // Issue JWT
  const jwt = await signJWT({
    advisorId: advisor.id,
    email: advisor.email,
    name: advisor.name,
    isAdmin: advisor.is_admin === 1,
  });

  const res = NextResponse.redirect(new URL("/", req.url));

  res.cookies.set("auth_token", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  // Clear the CSRF state cookie
  res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });

  return res;
}
