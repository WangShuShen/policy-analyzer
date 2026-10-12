import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { hasAnyRequiredConsent, hasRequiredConsent } from "@/lib/consents";

/** 客戶端頁面的守門（伺服器端）：客戶帳號＋已同意目前版本的同意書（N4）。回傳 userId 與名字 */
export async function requireConsultPage(): Promise<{ userId: string; name: string }> {
  const token = (await cookies()).get("auth_token")?.value;
  const session = token ? await verifyJWT(token) : null;
  if (!session) redirect("/welcome/consent");
  if (roleOf(session) !== "customer") redirect("/");
  if (!(await hasRequiredConsent(session.advisorId))) {
    redirect((await hasAnyRequiredConsent(session.advisorId)) ? "/welcome/consent?error=consent_outdated" : "/welcome/consent");
  }
  return { userId: session.advisorId, name: session.name };
}
