import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublic, listPublic } from "@/lib/news/store";
import { ArticleView, isoDate } from "@/components/news/NewsParts";
import { siteUrl } from "@/lib/news/site";

// 單篇快訊（W3）：免登入、SSR；只讀審核通過的公開版（N3）。分享圖在同層 opengraph-image.tsx
export const dynamic = "force-dynamic";
const load = cache((slug: string) => getPublic(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await load((await params).slug);
  if (!a) return { title: "找不到這篇快訊 · RADIA" };
  return {
    metadataBase: new URL(siteUrl()),
    title: `${a.title} | RADIA`,
    description: a.summary,
    alternates: { canonical: `/news/${a.slug}` },
    openGraph: { title: a.title, description: a.summary, type: "article", url: `/news/${a.slug}`, siteName: "RADIA",
      publishedTime: isoDate(a.publishedAt), modifiedTime: isoDate(a.updatedAt), section: a.category },
    twitter: { card: "summary_large_image", title: a.title, description: a.summary },
  };
}

export default async function NewsArticle({ params }: { params: Promise<{ slug: string }> }) {
  const a = await load((await params).slug);
  if (!a) notFound();
  const others = (await listPublic()).filter(x => x.slug !== a.slug);
  const related = [...others.filter(x => x.category === a.category), ...others.filter(x => x.category !== a.category)].slice(0, 2);
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.summary,
    datePublished: isoDate(a.publishedAt), dateModified: isoDate(a.updatedAt), publisher: { "@type": "Organization", name: "RADIA" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <ArticleView a={a} related={related} />
    </>
  );
}
