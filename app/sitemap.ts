import type { MetadataRoute } from "next";
import { listPublic } from "@/lib/news/store";
import { siteUrl } from "@/lib/news/site";
import { isoDate } from "@/components/news/NewsParts";

// sitemap.xml（W3）：落地頁、快訊列表、每篇公開的快訊（只列審核通過、沒下架的）
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const list = await listPublic();
  return [
    { url: `${base}/welcome`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/news`, lastModified: list[0] ? isoDate(list[0].updatedAt) : undefined, changeFrequency: "weekly", priority: 0.9 },
    ...list.map(a => ({ url: `${base}/news/${a.slug}`, lastModified: isoDate(a.updatedAt), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
