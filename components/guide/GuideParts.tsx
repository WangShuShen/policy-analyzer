import Link from "next/link";
import type { Article, Block, Section } from "@/lib/guide/articles";

/*
 * 保險小教室的畫面（4-av）：把 lib/guide/articles.ts 的資料畫成原型元件
 * （eyebrow／h2.t／sub、bookguide 的 bgs 列、gpwhy 問答、tagx）。內容只從資料檔來，這裡不寫任何文章文字。
 */

// 文字記號 → React：**粗體**、[[按鈕名稱]]、[文字](網址)。不吃 HTML，顧問打錯也不會壞版或被注入
export function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[\[(.+?)\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={i++}>{m[1]}</b>);
    else if (m[2] !== undefined) out.push(<span key={i++} className="gd-k">{m[2]}</span>);
    else out.push(<A key={i++} href={m[4]}>{m[3]}</A>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// 站內連結用 Link；https 開頭的外部連結開新分頁
function A({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return /^https?:\/\//.test(href)
    ? <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>
    : <Link className={className} href={href}>{children}</Link>;
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "p": return <p className="gd-p"><Rich text={b.text} /></p>;
    case "mute": return <p className="gd-p gd-mute"><Rich text={b.text} /></p>;
    case "list": return <ul className="gd-ul">{b.items.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>;
    case "tip": return <div className="gd-tip"><Rich text={b.text} /></div>;
    case "warn": return <div className="gd-warn"><Rich text={b.text} /></div>;
    case "checks": return <>{b.items.map(c => (
      <div key={c.title} className="bgs"><span className="bgn" aria-hidden="true">✓</span><div><div className="bgt">{c.title}</div><div className="bgd"><Rich text={c.text} /></div></div></div>
    ))}</>;
    case "numbered": return <div className="gd-num">{b.items.map((t, i) => (
      <div key={i} className="bgs"><span className="bgn">{i + 1}</span><div className="bgd" style={{ marginTop: 2 }}><Rich text={t} /></div></div>
    ))}</div>;
    case "groups": return <div className="gd-groups">{b.items.map(g => (
      <div key={g.title} className="gd-group"><div className="bgt">{g.title}</div><ul className="gd-ul">{g.items.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul></div>
    ))}</div>;
    case "table": return (
      <table className="gd-table">
        <thead><tr>{b.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0
          ? <th key={j} scope="row"><Rich text={c} /></th>
          : <td key={j} data-h={b.head[j]}><Rich text={c} /></td>)}</tr>)}</tbody>
      </table>
    );
    case "links": return <div className="gd-links">{b.items.map(l => <A key={l.href} href={l.href}>{l.text}</A>)}</div>;
    case "button": return <A className="btn gd-cta" href={b.href}>{b.text}</A>;
  }
}

function SectionView({ s }: { s: Section }) {
  if (s.kind === "steps") return (
    <>
      <h3 className="gd-h">{s.title}</h3>
      <ol className="gd-steps">{s.steps.map((st, i) => (
        <li key={st.title} className="gd-step">
          <div className="gd-sh"><span className="bgn">{i + 1}</span><h4>{st.title}</h4>{st.when && <span className="tagx ok">{st.when}</span>}</div>
          <div className="gd-sb">{st.body.map((b, j) => <BlockView key={j} b={b} />)}</div>
        </li>
      ))}</ol>
    </>
  );
  if (s.kind === "faq") return (
    <>
      <h3 className="gd-h">{s.title}</h3>
      {s.items.map(f => <details key={f.q} className="gpwhy"><summary>{f.q}</summary><div className="gpwb"><Rich text={f.a} /></div></details>)}
    </>
  );
  const body = s.blocks.map((b, j) => <BlockView key={j} b={b} />);
  return (
    <>
      {s.title && <h3 className="gd-h">{s.title}</h3>}
      {s.boxed ? <div className="bookguide gd-box">{body}</div> : <div className="gd-flow">{body}</div>}
    </>
  );
}

export function ArticleView({ a }: { a: Article }) {
  return (
    <article className="gd">
      <Link className="gd-back" href="/guide">‹ 保險小教室</Link>
      <h2 className="t">{a.title}</h2>
      <p className="sub">{a.lede}</p>
      {a.facts && <div className="gd-facts">{a.facts.map(f => <div key={f.big}><b>{f.big}</b><span>{f.small}</span></div>)}</div>}
      {a.sections.map((s, i) => <SectionView key={i} s={s} />)}
      {a.end && (
        <div className="gd-end">
          <p><Rich text={a.end.text} /></p>
          <div className="gd-endb">
            <Link className="btn" href="/analysis#upload">上傳保險存摺</Link>
            <Link className="btn ghost gd-adv" href="/advisors">約顧問</Link>
          </div>
        </div>
      )}
      {a.source && <p className="gd-src">{a.source}</p>}
    </article>
  );
}
