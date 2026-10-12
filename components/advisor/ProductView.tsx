"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FxGrid } from "@/lib/advisor/fxgrid";
import { FxGridView } from "./FxGridView";

/*
 * 商品條款頁：原型沒有這個畫面（「看條款」沒連到任何頁），用原型 advanalyze／advcatalog 的元件組成。
 *   標頭（anahd）→ 試算列（acnext）→ 十格全險圖（fxg，跟保單分析同一份）→ 注意事項 → 條款／費率／說明 PDF
 * 「重新審核」只給管理者：它會把商品送回保單審核，而保單審核只有管理者進得去（2026-10-11）。
 */
type Grid = { reviewed: boolean; company: string; productName: string; productType: string | null; contractType: string | null; period: string | null; baseUnit: string | null; plans: string[]; grid: FxGrid };
type Info = { annualLimit?: { formula?: string }; exclusions?: string[]; specialRestrictions?: string[]; displayCode?: string };
type Doc = "clause" | "rate" | "spec";
const DOCS: [Doc, string][] = [["clause", "條款"], ["rate", "費率"], ["spec", "說明"]];
const FAV_KEY = "radia.catalog.fav";
type Fav = { planCode: string; name: string };
const loadFav = (): Fav[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); } catch { return []; } };

export function ProductView({ planCode, isAdmin }: { planCode: string; isAdmin: boolean }) {
  const router = useRouter();
  const [meta, setMeta] = useState<{ product_name?: string; company?: string; category?: string } | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [docIds, setDocIds] = useState<Record<Doc, string | null>>({ clause: null, rate: null, spec: null });
  const [loaded, setLoaded] = useState(false);
  const [g, setG] = useState<Grid | null>(null);
  const [gErr, setGErr] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("萬");
  const [plan, setPlan] = useState("");
  const [calcing, setCalcing] = useState(false);
  const [doc, setDoc] = useState<Doc>("clause");
  const [pdf, setPdf] = useState<{ url: string | null; status: "loading" | "ok" | "none" }>({ url: null, status: "loading" });
  const [fav, setFav] = useState(false);
  const [reopen, setReopen] = useState<"idle" | "ask" | "busy">("idle");
  const [reErr, setReErr] = useState("");

  useEffect(() => {
    fetch(`/api/products?planCode=${encodeURIComponent(planCode)}`).then(r => r.json()).then(d => {
      setMeta(d.product ?? null); setInfo(d.analysis ?? null);
      setDocIds({ clause: d.pdfDriveId ?? null, rate: d.rateDriveId ?? null, spec: d.specDriveId ?? null });
    }).catch(() => {}).finally(() => setLoaded(true));
    setFav(loadFav().some(f => f.planCode === planCode));
    calc(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCode]);

  // 十格全險圖：跟保單分析同一支 API（資料庫命中那條路）
  const calc = async (first = false) => {
    setCalcing(true);
    const held = first ? {} : { amount: amount ? Number(amount.replace(/,/g, "")) : null, unit, plan: plan || null };
    const r = await fetch("/api/advisor/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode, ...held }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setCalcing(false);
    if (!r?.ok) { setGErr(r?.status === 409 ? "no_formula" : r?.status === 404 ? "not_found" : (j.error ?? "讀取失敗")); return; }
    setGErr(""); setG(j);
    if (first) { if (j.baseUnit === "單位數") setUnit("單位"); if (j.plans?.length) setPlan(j.plans[0]); }
  };

  // 文件：條款／費率／說明，跟原本一樣經 pdf-proxy 讀（本地檔或 Google Drive）
  useEffect(() => {
    if (!loaded) return;
    const id = docIds[doc];
    if (!id) { setPdf({ url: null, status: "none" }); return; }
    let url = "";
    const q = new URLSearchParams(); if (doc === "clause") q.set("planCode", planCode); q.set("driveId", id);
    setPdf({ url: null, status: "loading" });
    fetch(`/api/pdf-proxy/local?${q}`)
      .then(r => { if (r.ok && (r.headers.get("content-type") ?? "").includes("pdf")) return r.blob(); throw new Error("not-pdf"); })
      .then(b => { url = URL.createObjectURL(b); setPdf({ url, status: "ok" }); })
      .catch(() => setPdf({ url: null, status: "none" }));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [loaded, doc, docIds, planCode]);

  const name = g?.productName ?? meta?.product_name ?? planCode;
  const company = g?.company ?? meta?.company ?? "";

  const toggleFav = () => {
    const cur = loadFav();
    const nf = fav ? cur.filter(f => f.planCode !== planCode) : [{ planCode, name }, ...cur].slice(0, 12);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(nf)); } catch { /* 無痕模式 */ }
    setFav(!fav);
  };

  const doReopen = async () => {
    setReopen("busy"); setReErr("");
    const r = await fetch(`/api/products/${encodeURIComponent(planCode)}/reopen`, { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.uuid) { setReopen("idle"); setReErr(j.error ?? "送回審核沒有成功"); return; }
    router.push(`/review/${encodeURIComponent(j.uuid)}`);
  };

  if (!loaded && !g && !gErr) return <div className="rd-loading">讀取中…</div>;

  const notes = [
    info?.annualLimit?.formula && `年度上限：${info.annualLimit.formula}`,
    ...(info?.exclusions ?? []).map(e => `除外：${e}`),
    ...(info?.specialRestrictions ?? []),
  ].filter(Boolean) as string[];
  const status = gErr === "no_formula" ? "條款還沒分析" : g ? (g.reviewed ? "公式已審核" : "公式 AI 讀取待審") : null;

  return (
    <>
      <div className="anahd">
        <div style={{ minWidth: 0 }}>
          <div className="ac1">{name}</div>
          <div className="ac2">{[name.startsWith(company.slice(0, 2)) ? null : company, `代號 ${info?.displayCode || planCode}`, g?.productType ?? meta?.category, g?.contractType, g?.period, status].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="aact">
          <Link className="abtn" href="/catalog" style={{ textDecoration: "none" }}>回商品查詢</Link>
          <button className={`abtn ${fav ? "pri" : ""}`} onClick={toggleFav}>{fav ? "★ 已收藏" : "☆ 收藏"}</button>
          {isAdmin && reopen === "idle" && <button className="abtn" onClick={() => setReopen("ask")}>重新審核</button>}
        </div>
      </div>
      {isAdmin && reopen !== "idle" && (
        <div className="acnext" style={{ marginTop: 12 }}>
          <div className="anx">送回保單審核？</div><span style={{ fontSize: 13, color: "var(--ink-2)", flex: 1 }}>商品會回到審核佇列，並打開編輯頁。</span>
          <button className="abtn" disabled={reopen === "busy"} onClick={() => setReopen("idle")}>取消</button>
          <button className="abtn pri" disabled={reopen === "busy"} onClick={doReopen}>{reopen === "busy" ? "送出中…" : "送回審核"}</button>
        </div>
      )}
      {reErr && <div className="rd-err">{reErr}</div>}

      {g ? (
        <>
          {!g.reviewed && <div className="anapend" style={{ marginTop: 12 }}><span className="dotp" />這份給付公式是 <b>AI 讀出來的，還沒審核</b>——送規劃書前要先核（P4）</div>}
          <div className="acnext">
            <div className="anx">保額試算</div>
            <input className="asrch" style={{ minWidth: 96, maxWidth: 140, flex: "1 1 96px" }} inputMode="decimal" placeholder="例：300" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && calc()} aria-label="保額數字" />
            <select className="asel" value={unit} onChange={e => setUnit(e.target.value)} aria-label="單位"><option>萬</option><option>元</option><option>單位</option><option>美元</option></select>
            {g.plans.length > 0 && <select className="asel" value={plan} onChange={e => setPlan(e.target.value)} aria-label="計劃別">{g.plans.map(p => <option key={p} value={p}>計劃 {p}</option>)}</select>}
            <button className="abtn pri" disabled={calcing} onClick={() => calc()}>{calcing ? "計算中…" : "試算"}</button>
          </div>
          <FxGridView grid={g.grid} noAmount={!amount} />
        </>
      ) : (
        <div className="gate" style={{ marginTop: 16 }}>
          <svg className="ill i56" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-doc" /></svg>
          <div className="gt">{gErr === "no_formula" ? "這張的條款還沒分析" : gErr === "not_found" ? "資料庫裡沒有這張的給付資料" : "給付資料讀取失敗"}</div>
          <div className="gd">{gErr === "no_formula" || gErr === "not_found"
            ? <>{Object.values(docIds).some(Boolean) && <>下面可以先看條款原文。<br /></>}要馬上看十格全險圖，到<Link href="/analyze" style={{ color: "var(--brand-ink)" }}>保單分析</Link>上傳條款讓 AI 讀。</>
            : gErr}</div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="acnext" style={{ display: "block" }}>
          <div className="anx" style={{ marginBottom: 6 }}>注意事項</div>
          {notes.map((n, i) => <div key={i} style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-2)", padding: "3px 0" }}>{n}</div>)}
        </div>
      )}

      <div className="rd-docbar">
        <div className="ah2" style={{ margin: 0 }}>條款原文</div>
        <div className="seg">{DOCS.map(([k, l]) => (
          <button key={k} aria-pressed={doc === k} onClick={() => setDoc(k)} style={docIds[k] ? undefined : { color: "var(--muted)" }}>{l}{!docIds[k] && loaded ? "（無）" : ""}</button>
        ))}</div>
      </div>
      <div className={`rd-docview ${pdf.status === "ok" ? "" : "empty"}`}>
        {pdf.status === "loading" && <div className="rd-docmsg">讀取文件中…</div>}
        {pdf.status === "none" && <div className="rd-docmsg">這張商品還沒有{DOCS.find(([k]) => k === doc)![1]} PDF。</div>}
        {pdf.status === "ok" && pdf.url && <iframe src={pdf.url} title={`${name} ${DOCS.find(([k]) => k === doc)![1]}`} />}
      </div>
      <div className="acsrc">本資料由 AI 分析、管理者人工審核，僅供參考；實際給付以保單條款為準。</div>
    </>
  );
}
