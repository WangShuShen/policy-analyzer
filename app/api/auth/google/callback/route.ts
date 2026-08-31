import { NextRequest, NextResponse } from "next/server";
import { getAdvisorByEmail, upsertUserOnLogin } from "@/lib/db";
import { signJWT } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const loginUrl = (error: string, hint?: string) => {
    const u = new URL(`/login?error=${error}`, req.url);
    if (hint) u.searchParams.set("hint", hint);
    return u;
  };

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
  // Normalize to lowercase to avoid case mismatch
  const email = (userInfo.email as string).toLowerCase().trim();

  const displayName = ((userInfo.name as string) || email.split("@")[0]).trim();

  // 先看是否為內部顧問（白名單）；不是的話一律以客戶身分自助註冊。
  const advisor = await getAdvisorByEmail(email);

  let jwt: string;
  let landing = "/";

  if (advisor) {
    jwt = await signJWT({
      advisorId: advisor.id,
      email: advisor.email,
      name: advisor.name,
      isAdmin: advisor.is_admin === 1,
      role: "advisor",
    });
  } else {
    const { user } = await upsertUserOnLogin(email, displayName);
    if (user.is_active !== 1) {
      return NextResponse.redirect(loginUrl("account_disabled", email));
    }
    jwt = await signJWT({
      advisorId: user.id,
      email: user.email,
      name: user.name,
      isAdmin: false,
      role: "customer",
      plan: user.plan,
    });
    landing = "/catalog";
  }

  const res = NextResponse.redirect(new URL(landing, req.url));

  res.cookies.set("auth_token", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });

  return res;
}
