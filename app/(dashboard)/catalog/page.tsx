"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CatalogRow } from "@/lib/catalog/search";

/*
 * 商品查詢（原型 SCREENS.advcatalog）。
 * 我們家（三商美邦）／別家：別家商品只能查，不能提案——用途是看懂客戶手上那張。
 * 最近查過、收藏先存在這台瀏覽器（W2 CRM 再搬進帳號）。
 */
const RECENT_KEY = "radia.catalog.recent", FAV_KEY = "radia.catalog.fav";
type Fav = { planCode: string; name: string };
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等 */ } };

export default function CatalogPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mine" | "other">("other");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ mine: number; other: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [fav, setFav] = useState<Fav[]>([]);

  useEffect(() => { setRecent(load(RECENT_KEY, [])); setFav(load(FAV_KEY, [])); }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await fetch(`/api/advisor/catalog?tab=${tab}&q=${encodeURIComponent(q)}`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      setLoading(false);
      if (!j) return;
      setRows(j.rows); setTotal(j.total); setCounts(j.counts);
      if (q.trim().length >= 2) { const nr = [q.trim(), ...load<string[]>(RECENT_KEY, []).filter(x => x !== q.trim())].slice(0, 6); setRecent(nr); save(RECENT_KEY, nr); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, tab]);

  const favSet = useMemo(() => new Set(fav.map(f => f.planCode)), [fav]);
  const toggleFav = (r: CatalogRow) => {
    const nf = favSet.has(r.planCode) ? fav.filter(f => f.planCode !== r.planCode) : [{ planCode: r.planCode, name: r.name }, ...fav].slice(0, 12);
    setFav(nf); save(FAV_KEY, nf);
  };

  return (
    <>
      <div className="acbar"><input type="search" className="asrch" placeholder="商品名稱、公司、代號…" value={q} onChange={e => setQ(e.target.value)} aria-label="搜尋商品" /></div>
      {recent.length > 0 && (
        <div className="achips"><span className="ack">最近查過</span>{recent.map(r => <button key={r} className="achip" onClick={() => setQ(r)}>{r}</button>)}</div>
      )}
      {fav.length > 0 && (
        <div className="achips"><span className="ack">收藏</span>{fav.map(f => <Link key={f.planCode} className="achip fav" href={`/product/${encodeURIComponent(f.planCode)}`} style={{ textDecoration: "none" }}>★ {f.name}</Link>)}</div>
      )}
      <div className="seg" style={{ margin: "4px 0 14px" }}>
        <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>我們家{counts && `（${counts.mine.toLocaleString()}）`}</button>
        <button aria-pressed={tab === "other"} onClick={() => setTab("other")}>別家{counts && `（${counts.other.toLocaleString()}）`}</button>
      </div>
      {tab === "other"
        ? <div className="statusline" style={{ margin: "0 0 12px" }}><span className="dotp" /><span>別家商品<strong>只能查，不能提案</strong>——用途是看懂客戶手上那張。</span></div>
        : <div className="statusline" style={{ margin: "0 0 12px" }}><span className="dotp" /><span>我們家的條款還在整理（W1b），<strong>目前只有商品清單與銷售期間</strong>。</span></div>}
      <div className="ah2" style={{ margin: "0 0 8px" }}>{loading ? "搜尋中…" : `${total.toLocaleString()} 筆${total > rows.length ? `，先列出 ${rows.length} 筆（打更多字縮小範圍）` : ""}`}</div>
      <div className="acres">
        {rows.map(r => (
          <div key={r.planCode} className="acrr">
            <button className={`astar ${favSet.has(r.planCode) ? "on" : ""}`} aria-label={favSet.has(r.planCode) ? "取消收藏" : "收藏"} onClick={() => toggleFav(r)}>{favSet.has(r.planCode) ? "★" : "☆"}</button>
            <div className="acrn"><b>{r.name}</b><span>{r.company} · {r.period}</span></div>
            {r.category && <span className="tagx ok">{r.category}</span>}
            <span className={`tagx ${r.onSale ? "ok" : ""}`} style={r.onSale ? undefined : { color: "var(--muted)", background: "var(--sunk)" }}>{r.onSale ? "現售" : "停售"}</span>
            {r.mine ? <button className="abtn" disabled title="條款整理中">條款整理中</button>
              : <Link className="abtn" href={`/product/${encodeURIComponent(r.planCode)}`} style={{ textDecoration: "none" }}>看條款</Link>}
          </div>
        ))}
      </div>
    </>
  );
}
