import { cookies } from "next/headers";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { ProductView } from "@/components/advisor/ProductView";

// 商品條款頁（原型沒有這個畫面，用原型 advanalyze／advcatalog 的元件組成）。舊版備份在 backups/legacy-brand/product-page.old.tsx
export default async function ProductPage({ params }: { params: Promise<{ planCode: string }> }) {
  const { planCode } = await params;
  const token = (await cookies()).get("auth_token")?.value;
  const s = token ? await verifyJWT(token) : null;
  return <ProductView planCode={decodeURIComponent(planCode)} isAdmin={!!s?.isAdmin && roleOf(s) === "advisor"} />;
}
