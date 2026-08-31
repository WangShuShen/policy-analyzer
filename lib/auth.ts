import { NextRequest, NextResponse } from "next/server";
import { roleOf, verifyJWT, type JWTPayload } from "@/lib/jwt";

// API route 的授權守衛（proxy.ts 已做過一層樂觀檢查，這裡是第二道防線）。
//
// 注意：auth_token 這個 cookie 歷史上承載過兩種憑證——全站密碼的雜湊字串，
// 以及顧問 Google 登入的自簽 JWT。proxy.ts 從一開始就只認 JWT，
// 因此全站密碼路徑（/api/auth POST）實際上已是失效的舊路徑，此處維持相同判準，
// 不放寬門檻。日後客戶帳號上線時，改以 JWT payload 內的 role 區分身分。

export async function getSession(req: NextRequest): Promise<JWTPayload | null> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return null;
  return verifyJWT(token);
}

export function unauthorized(message = "請先登入"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "權限不足"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** 任何已登入身分皆可。回傳 NextResponse 代表已被擋下。 */
export async function requireIdentity(req: NextRequest): Promise<JWTPayload | NextResponse> {
  return (await getSession(req)) ?? unauthorized();
}

/** 需為內部顧問身分；訂閱客戶不得使用。 */
export async function requireAdvisor(req: NextRequest): Promise<JWTPayload | NextResponse> {
  const session = await getSession(req);
  if (!session) return unauthorized();
  if (roleOf(session) !== "advisor") return forbidden("此功能限顧問使用");
  return session;
}

export async function requireAdmin(req: NextRequest): Promise<JWTPayload | NextResponse> {
  const session = await requireAdvisor(req);
  if (session instanceof NextResponse) return session;
  if (!session.isAdmin) return forbidden("此功能限管理者使用");
  return session;
}
