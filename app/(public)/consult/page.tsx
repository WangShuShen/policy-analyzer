import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { hasAnyRequiredConsent, hasRequiredConsent } from "@/lib/consents";
import { ConsultChat } from "@/components/public/ConsultChat";

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
  return <ConsultChat name={session.name} />;
}
