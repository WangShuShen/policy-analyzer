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
    // 金流回呼由綠界伺服器發出，不會帶 cookie；被擋掉會導致付款成功卻沒升級方案。
    // 此路徑改以 CheckMacValue 驗簽自保。
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/setup-admin" ||
    pathname === "/api/admin/seed-drive" ||
    pathname === "/login" ||
    // RADIA 客戶端的公開頁：落地頁、同意書、衛教模式（不用登入、不記任何資料）
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname === "/consult/edu" ||
    pathname === "/api/consult/edu" ||   // 衛教模式 API：不用登入、不記任何資料
    pathname === "/api/dev-login" ||     // 本機測試登入（DEV_LOGIN=1＋localhost 才有作用）
    pathname === "/pricing" ||
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

  // 客戶端頁面沒登入時回同意書，不是回顧問登入頁
  const isConsult = pathname === "/consult" || pathname.startsWith("/consult/") || pathname === "/analysis" || pathname === "/advisors" || pathname.startsWith("/advisors/") || pathname.startsWith("/booked/") || pathname === "/me";
  if (!token) {
    return NextResponse.redirect(isConsult ? new URL("/welcome/consent", req.url) : loginRedirect());
  }

  const payload = await verifyJWT(token);

  if (!payload) {
    // 登入過期：客戶端頁面回客戶的入口，不要把客戶丟到「顧問專用」的登入頁
    const res = NextResponse.redirect(isConsult ? new URL("/welcome/consent", req.url) : loginRedirect());
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
    pathname.startsWith("/api/correction") ||
    pathname.startsWith("/profile") ||          // 我的顧問頁
    pathname.startsWith("/clients") ||          // 我的客戶、客戶頁
    pathname.startsWith("/todo") ||             // 顧問待辦
    pathname.startsWith("/analyze") ||          // 保單分析
    pathname.startsWith("/catalog") ||          // 商品查詢
    pathname.startsWith("/product/") ||         // 商品條款頁
    pathname.startsWith("/api/advisor/");       // 顧問端 API（路由內另以 requireAdvisor 把關）

  if (roleOf(payload) === "customer" && isAdvisorArea) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "權限不足" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/me", req.url));     // 客戶帳號回客戶端的家
  }

  if (pathname.startsWith("/admin") && !payload.isAdmin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
