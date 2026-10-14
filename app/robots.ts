import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/news/site";

// robots.txt（W3）：上線版只開放公開頁（快訊、落地頁），開發版整站擋搜尋引擎
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: ["/news", "/welcome"], disallow: ["/welcome/", "/api/", "/admin", "/consult", "/analysis", "/me", "/booked", "/advisors", "/login", "/dev"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
