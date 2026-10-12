import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { Shell } from "@/components/radia/Shell";
import { AdvisorChrome } from "@/components/radia/AdvisorChrome";
import { AdvisorNav } from "@/components/radia/AdvisorNav";

/*
 * 顧問端外框（原型 advui）：跟客戶端同一個 RADIA 外框，內容最上面是「標題＋分頁」。
 * 2026-10-11 依原型改版：拿掉舊後台的左側欄。字小、密度高、圓角小、桌機優先（原型「顧問端 design token」）。
 */
export default async function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("auth_token")?.value;
  const s = token ? await verifyJWT(token) : null;
  if (!s) redirect("/login");
  return (
    <Shell chrome={<AdvisorChrome name={s.name} />}>
      <div className="advui">
        <AdvisorNav name={s.name} isAdmin={s.isAdmin && roleOf(s) === "advisor"} />
        {children}
      </div>
    </Shell>
  );
}
