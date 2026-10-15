import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { hasAnyRequiredConsent, hasRequiredConsent } from "@/lib/consents";
import { ConsultChat } from "@/components/public/ConsultChat";
import { aiMock } from "@/lib/consult/mock";
import { MockBanner } from "@/components/public/MockBanner";
import type { Viewport } from "next";

// 一屏聊天：手機底部輸入列要避開 iPhone 主畫面指示條（viewport-fit=cover，env(safe-area-inset-bottom) 才有值）
export const viewport: Viewport = { viewportFit: "cover" };

/*
 * AI 諮詢入口。proxy 只做樂觀的 cookie 檢查，這裡在伺服器端再確認兩件事：
 * ①是客戶帳號 ②已同意目前版本的同意書——沒同意就不能蒐集任何個資（N4）。
 */
export default async function ConsultPage() {
  const token = (await cookies()).get("auth_token")?.value;
  const session = token ? await verifyJWT(token) : null;
  if (!session) redirect("/welcome/consent");
  if (roleOf(session) !== "customer") redirect("/");
  if (!(await hasRequiredConsent(session.advisorId))) {
    // 同意過舊版 → 提示「內容更新了」；從沒同意過 → 直接看同意書
    redirect((await hasAnyRequiredConsent(session.advisorId)) ? "/welcome/consent?error=consent_outdated" : "/welcome/consent");
  }
  return <>{aiMock() && <MockBanner />}<ConsultChat name={session.name} /></>;
}
