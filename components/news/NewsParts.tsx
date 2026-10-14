import Link from "next/link";
import { renderMarkdown, readMinutes } from "@/lib/news/markdown";
import type { PublicArticle } from "@/lib/news/store";

/*
 * 保險快訊的畫面零件（W3，設計稿 tmp/w3-mock 顧問 10/14 核可）。樣式在 radia-extra.css 的 .nw-*。
 * 4-aj：只寫「顧問已審閱」，不寫審閱人姓名、不寫任何公司。
 */
/** 資料庫存 UTC 文字 → 台灣日期 2026/10/20 */
export const twDate = (utc: string) => new Date(utc.replace(" ", "T") + "Z").toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
export const isoDate = (utc: string) => new Date(utc.replace(" ", "T") + "Z").toISOString();

export function Cover({ icon }: { icon: string }) {
  return <div className="nw-cover"><svg viewBox="0 0 48 48" aria-hidden="true"><use href={`#${icon}`} /></svg></div>;
}

export function Meta({ a }: { a: PublicArticle }) {
  return <div className="nw-meta"><span className="k">{a.category}</span><span>{twDate(a.publishedAt)}</span><span>·</span><span>閱讀 {readMinutes(a.body)} 分鐘</span></div>;
}

export function ArticleCard({ a, kind }: { a: PublicArticle; kind: "lead" | "row" }) {
  return (
    <Link className={`nw-item ${kind}`} href={`/news/${a.slug}`}>
      <Cover icon={a.cover} />
      <div className="nw-ib"><Meta a={a} /><div className="nw-tt">{a.title}</div><div className="nw-sm">{a.summary}</div></div>
    </Link>
  );
}

export function ArticleView({ a, related = [], preview = false }: { a: PublicArticle; related?: PublicArticle[]; preview?: boolean }) {
  return (
    <article className="nw-art">
      {preview && <div className="nw-preview">預覽：這是編輯中的稿，還沒有公開</div>}
      <Link className="nw-back" href="/news">‹ 保險快訊</Link>
      <Meta a={a} />
      <h1>{a.title}</h1>
      <p className="nw-lead">{a.summary}</p>
      {!preview && <div className="nw-by"><span className="ok">✓ 顧問已審閱</span><span>·</span><span>{twDate(a.publishedAt)} 發布{a.updatedAt !== a.publishedAt ? `，${twDate(a.updatedAt)} 更新` : ""}</span></div>}
      <Cover icon={a.cover} />
      <div className="nw-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }} />
      {a.sources && <div className="nw-src"><div className="sh">資料來源</div>{a.sources}</div>}
      <div className="nw-next">
        <div className="t">看完還是不確定自己夠不夠？</div>
        <p>跟 RADIA 聊聊你的狀況。看懂了，要不要調整，你自己決定。</p>
        <Link className="btn" href="/welcome" style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}>免費聊聊</Link>
      </div>
      {related.length > 0 && (
        <div className="nw-rel"><h3>延伸閱讀</h3><div className="nw-list">{related.map(r => <ArticleCard key={r.slug} a={r} kind="row" />)}</div></div>
      )}
    </article>
  );
}
