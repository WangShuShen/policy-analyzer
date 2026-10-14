import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, listPublic } from "@/lib/news/store";
import { ArticleCard } from "@/components/news/NewsParts";
import { siteUrl } from "@/lib/news/site";

// 保險快訊列表（W3）：免登入、SSR。?c=分類
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "保險快訊 · RADIA",
  description: "把保險的事，講成聽得懂的話。每篇都經過顧問審閱，數字附上出處和年份，你可以自己查。",
  alternates: { canonical: "/news" },
  openGraph: { title: "保險快訊 · RADIA", description: "把保險的事，講成聽得懂的話。每篇都經過顧問審閱。", type: "website", url: "/news" },
};

export default async function NewsList({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const c = (await searchParams).c;
  const cat = CATEGORIES.includes(c as never) ? c : undefined;
  const all = await listPublic();
  const list = cat ? all.filter(a => a.category === cat) : all;
  const used = CATEGORIES.filter(k => all.some(a => a.category === k));
  return (
    <div>
      <div className="nw-hd">
        <div className="eyebrow">保險快訊</div>
        <h2 className="t">把保險的事，講成聽得懂的話</h2>
        <p className="sub">每篇都經過顧問審閱。數字一定附上出處和年份，你可以自己查。</p>
      </div>
      {used.length > 1 && (
        <nav className="nw-cats" aria-label="分類">
          <Link className={`nw-cat ${!cat ? "on" : ""}`} href="/news">全部</Link>
          {used.map(k => <Link key={k} className={`nw-cat ${cat === k ? "on" : ""}`} href={`/news?c=${encodeURIComponent(k)}`}>{k}</Link>)}
        </nav>
      )}
      {list.length ? (
        <>
          <div className="nw-list">{list.map((a, i) => <ArticleCard key={a.slug} a={a} kind={i === 0 ? "lead" : "row"} />)}</div>
          <div className="nw-more">已經到底了 · 共 {list.length} 篇</div>
        </>
      ) : <div className="nw-empty">第一篇快訊還在準備中，過幾天再來看看。</div>}
    </div>
  );
}
