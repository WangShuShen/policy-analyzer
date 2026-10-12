import { NextRequest, NextResponse } from "next/server";
import { CONSENT_VERSION } from "@/lib/consentVersion";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth 未設定" }, { status: 500 });
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback";

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10,
    path: "/",
  };
  res.cookies.set("oauth_state", state, cookieOpts);

  // 從同意書頁來的（RADIA 客戶流程）：把勾選結果帶過 Google 登入，回來時跟帳號一起寫入同意紀錄。
  // 使用者勾選時還沒有帳號，所以只能先暫存在 10 分鐘有效的 cookie。
  const sp = req.nextUrl.searchParams;
  if (sp.get("flow") === "consult") {
    if (sp.get("cv") !== CONSENT_VERSION) {
      return NextResponse.redirect(new URL("/welcome/consent?error=consent_outdated", req.url));
    }
    res.cookies.set("oauth_flow", JSON.stringify({ flow: "consult", cv: CONSENT_VERSION, mk: sp.get("mk") === "1" }), cookieOpts);
  } else {
    res.cookies.set("oauth_flow", "", { maxAge: 0, path: "/" });
  }

  return res;
}
