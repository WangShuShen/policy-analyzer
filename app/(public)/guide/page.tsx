import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES } from "@/lib/guide/articles";

/*
 * 保險小教室列表（4-av）：照著做就會的步驟教學（快訊是新聞時事，會過期；小教室不太會過期）。
 * 公開頁、不用登入，顧問可以直接傳連結給客戶。文章與順序在 lib/guide/articles.ts。
 */
export const metadata: Metadata = {
  title: "保險小教室 · RADIA",
  description: "照著做就會的保險教學：下載保險存摺、申請理賠、看懂保單第一頁。",
};

export default function GuideList() {
  return (
    <div className="gd">
      <div className="eyebrow">保險小教室</div>
      <h2 className="t">照著做就會</h2>
      <p className="sub">申請理賠、下載保單、看懂保單——一步一步寫給第一次碰到的你。看完還是卡住，再找顧問一起看。</p>
      <div className="gd-list">
        {ARTICLES.map(a => (
          <Link key={a.slug} className="gd-item" href={`/guide/${a.slug}`}>
            <span className="gd-it">{a.title}</span>
            <span className="gd-is">{a.summary}</span>
            <span className="gd-ia" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
