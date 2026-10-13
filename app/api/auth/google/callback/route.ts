import { NextRequest, NextResponse } from "next/server";
import { getAdvisorByEmail, upsertUserOnLogin } from "@/lib/db";
import { CONSENT_VERSION, hasRequiredConsent, recordConsent } from "@/lib/consents";
import { signJWT } from "@/lib/jwt";
import { APPLICANT_COOKIE, applicantCookieOptions, applicantToken } from "@/lib/advisorApply";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // 從同意書頁出發的客戶流程（見 /api/auth/google），錯誤要回到同意書頁而不是顧問登入頁
  let flow: { flow: string; cv: string; mk: boolean } | null = null;
  try { flow = JSON.parse(req.cookies.get("oauth_flow")?.value || "null"); } catch { flow = null; }
  const consult = flow?.flow === "consult";
  const apply = flow?.flow === "advisor_apply";   // 從顧問申請頁出發（w1b-03）

  const loginUrl = (error: string, hint?: string) => {
    const u = new URL(consult ? `/welcome/consent?error=${error}` : apply ? `/welcome/advisor-apply?error=${error}` : `/login?error=${error}`, req.url);
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

  if (advisor && consult) {
    // 顧問帳號走客戶流程（多半是在測試）：不要悄悄登進顧問後台，明講要換帳號
    return NextResponse.redirect(loginUrl("advisor_account", email));
  }

  if (!advisor && apply) {
    // 不是顧問：不建客戶帳號，只發 30 分鐘的申請憑證（只能讀寫自己的申請，進不了任何登入後的頁面），回申請頁填表
    const res = NextResponse.redirect(new URL("/welcome/advisor-apply", req.url));
    res.cookies.set(APPLICANT_COOKIE, applicantToken(email, displayName), applicantCookieOptions);
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("oauth_flow", "", { maxAge: 0, path: "/" });
    return res;
  }

  // 已經是顧問（包含從申請頁進來、其實已核准的）：照常登入顧問工作台
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
    if (consult) {
      // 同意與建帳號在同一步完成，之後才進諮詢（N4：同意先於蒐集）
      if (flow!.cv !== CONSENT_VERSION) return NextResponse.redirect(loginUrl("consent_outdated"));
      await recordConsent(user.id, { marketing: flow!.mk });
    }
    // 沒有同意目前版本的（例如從顧問登入頁進來、或同意書改版了）先去看同意書
    landing = (await hasRequiredConsent(user.id)) ? "/consult" : "/welcome/consent";
  }

  // TODO(卡C w1b-04)：lib/admin/logins.ts 合進來後在這裡 recordLogin(...)，記下誰在什麼時候登入
  const res = NextResponse.redirect(new URL(landing, req.url));

  res.cookies.set("auth_token", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("oauth_flow", "", { maxAge: 0, path: "/" });

  return res;
}
