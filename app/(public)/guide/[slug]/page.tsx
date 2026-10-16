import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLES, getArticle } from "@/lib/guide/articles";
import { ArticleView } from "@/components/guide/GuideParts";

/*
 * 保險小教室的一篇（4-av）：/guide/passbook、/guide/claim、/guide/policy-basics…
 * 公開頁、不用登入（proxy 放行 /guide/）。文章內容全部在 lib/guide/articles.ts，顧問改字只改那個檔。
 * 保險存摺下載教學（10/16）原本是獨立頁面，併進來用同一套畫面；上傳區塊的「看教學」照樣連 /guide/passbook。
 */
export const dynamicParams = false;   // 只有資料檔裡有的文章，其他網址 404
export function generateStaticParams() { return ARTICLES.map(a => ({ slug: a.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return a ? { title: `${a.title} · 保險小教室 · RADIA`, description: a.summary } : {};
}

export default async function GuideArticle({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  return <ArticleView a={a} />;
}
