import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { Shell } from "@/components/radia/Shell";
import { ClientChrome } from "@/components/radia/ClientChrome";
import { GONE_PATH, userExists } from "@/lib/account/session";

export const metadata: Metadata = {
  title: "RADIA · 保險這件事，先弄懂再決定",
  description: "花三分鐘聊聊你的狀況，你會知道自己現在缺什麼。要不要找顧問談，聊完你自己決定。",
};

// 客戶端外框（原型 .viewport＋客戶端 header）：同一個 RADIA 外框，頂部依階段換成進度列或常駐導覽
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("auth_token")?.value;
  const s = token ? await verifyJWT(token) : null;
  const name = s && roleOf(s) === "customer" ? s.name : null;
  // 4-aw：帳號在別的裝置刪掉了，這台的登入還沒過期 → 清掉登入回首頁
  if (s && name !== null && !(await userExists(s.advisorId))) redirect(GONE_PATH);
  return <Shell chrome={<ClientChrome name={name} />}>{children}</Shell>;
}
