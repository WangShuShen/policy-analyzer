import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";

/** 顧問端頁面的守門（伺服器端）：只有顧問帳號進得來 */
export async function requireAdvisorPage(): Promise<{ advisorId: string; name: string }> {
  const token = (await cookies()).get("auth_token")?.value;
  const s = token ? await verifyJWT(token) : null;
  if (!s) redirect("/login");
  if (roleOf(s) !== "advisor") redirect("/catalog");
  return { advisorId: s.advisorId, name: s.name };
}
