"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogRow } from "@/lib/catalog/search";
import type { FxGrid } from "@/lib/advisor/fxgrid";
import { FxGridView } from "@/components/advisor/FxGridView";
import type { QueueItem } from "@/lib/advisor/analysisQueue";

/*
 * 保單分析（原型 SCREENS.advanalyze）：單張商品 → 十格全險圖。整份保險存摺的解析從客戶頁進入。
 *   ①待命：丟條款 PDF，或選「資料庫已收錄／資料庫沒有這張」；下面列「我送出的分析」
 *   ②資料庫已收錄：逐步列出在做什麼 → 十格全險圖
 *   ③資料庫沒有這張：排進分析佇列（2026-10-12 顧問：不現場花 API，用 skill 慢慢分析），好了在清單按「看結果」
 *   結果是十格全險圖；AI 讀出來的標「還沒入庫」
 * 原型的「存到客戶」「AI 建議的商品」「加入規劃看差異」「AI 分析師」屬 W2／W4，這裡先不做。
 * 舊版（多張上傳、AI 驗證、欄位更正）備份在 backups/legacy-brand/analyze-page.old.tsx，API 仍保留。
 */
type Result = {
  mode: "db" | "ai"; reviewed: boolean; company: string; productName: string; planCode: string | null; productType: string | null;
  contractType: string | null; period: string | null; baseUnit: string | null; plans: string[]; grid: FxGrid;
};
const STEPS = [["讀取商品名稱與保額", ""], ["比對保單資料庫", ""], ["取出給付公式", ""], ["套保額算出十格給付", ""]];
const MS = 700;
const ST: Record<QueueItem["status"], [string, string]> = { queued: ["排隊分析中", ""], done: ["分析好了", "ok"], failed: ["沒有分析成功", ""] };

export default function AnalyzePage() {
  const [state, setState] = useState<"idle" | "run" | "queued" | "done">("idle");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queued, setQueued] = useState<{ item: QueueItem; ahead: number } | null>(null);
  const loadQueue = () => fetch("/api/advisor/analyze").then(r => r.ok ? r.json() : null).then(d => d && setQueue(d.items)).catch(() => {});
  useEffect(() => { loadQueue(); }, []);
  const [path, setPath] = useState<"db" | "ai" | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogRow[]>([]);
  const [pick, setPick] = useState<CatalogRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("萬");
  const [plan, setPlan] = useState("");
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (path !== "db" || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/advisor/catalog?tab=other&q=${encodeURIComponent(q)}`).catch(() => null);
      if (r?.ok) setHits((await r.json()).rows.slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [q, path]);

  const held = () => ({ amount: amount ? Number(amount.replace(/,/g, "")) : null, unit: unit || null, plan: plan || null });

  const run = async () => {
    const my = ++runRef.current; setError("");
    if (path === "ai") {
      const fd = new FormData(); fd.append("file", file!);
      const h = held(); if (h.amount) fd.append("amount", String(h.amount)); if (h.unit) fd.append("unit", h.unit); if (h.plan) fd.append("plan", h.plan);
      const r = await fetch("/api/advisor/analyze", { method: "POST", body: fd }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) { setError(j.error ?? "送出沒有成功，請再試一次"); return; }
      loadQueue();
      if (j.item.status === "done") { openResult(j.item.id); return; }   // 同一份條款分析過 → 直接看
      setQueued(j); setState("queued"); return;
    }
    setState("run"); setStep(0); setElapsed(0); setResult(null);
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (runRef.current !== my) { clearInterval(tick); return; }
      const e = (Date.now() - t0) / 1000; setElapsed(e);
      setStep(Math.min(STEPS.length - 1, Math.floor(e * 1000 / MS)));
    }, 100);
    const r = await fetch("/api/advisor/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode: pick!.planCode, ...held() }) }).catch(() => null);
    clearInterval(tick);
    if (runRef.current !== my) return;
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setState("idle"); setError(j.error ?? "分析沒有成功，請再試一次"); return; }
    setStep(STEPS.length); setResult(j); setState("done");
  };

  // 佇列裡分析好的：用送出時填的保額算
  const openResult = async (id: string) => {
    setError("");
    const r = await fetch(`/api/advisor/analyze?id=${encodeURIComponent(id)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError(j.error ?? "讀不到這筆結果"); return; }
    setAmount(j.held?.amount ? String(j.held.amount) : ""); setUnit(j.held?.unit ?? "萬"); setPlan(j.held?.plan ?? "");
    setPath("ai"); setResult(j); setState("done");
  };

  const reset = () => { runRef.current++; setState("idle"); setPath(null); setPick(null); setFile(null); setResult(null); setQueued(null); setQ(""); setAmount(""); setPlan(""); loadQueue(); };
  const ready = path === "db" ? !!pick : path === "ai" ? !!file : false;

  if (state === "run") {
    return (
      <div className="an-run">
        <div className="an-hd"><span className="an-t">{pick!.name}</span><span className="an-el">{elapsed.toFixed(1)} 秒</span></div>
        <div className="ac2" style={{ margin: "-6px 0 12px" }}>資料庫已收錄 · 直接套給付公式</div>
        <div className="an-steps">{STEPS.map(([lab, nt], i) => (
          <div key={lab} className={`an-st ${i < step ? "ok" : i === step ? "on" : ""}`}><span className="an-ic" /><span>{lab}</span><span className="an-nt">{nt}</span></div>
        ))}</div>
        <div className="an-why">命中資料庫時公式是人工審核過的，所以這條路不只是快，<b>準確度也不一樣</b>。</div>
        <div className="acnext" style={{ marginTop: 15 }}><div className="anx">不想等</div><button className="abtn" onClick={reset}>取消這次分析</button></div>
      </div>
    );
  }

  if (state === "queued" && queued) {
    return (
      <div className="an-run">
        <div className="an-hd"><span className="an-t">{queued.item.filename}</span></div>
        <div className="ac2" style={{ margin: "-6px 0 12px" }}>資料庫沒有這張 · 已排進條款分析佇列</div>
        <div className="an-steps">
          <div className="an-st ok"><span className="an-ic" /><span>收到條款 PDF</span><span className="an-nt" /></div>
          <div className="an-st on"><span className="an-ic" /><span>排隊等 AI 逐項讀條款</span><span className="an-nt">{queued.ahead ? `前面還有 ${queued.ahead} 份` : "下一份就輪到"}</span></div>
          <div className="an-st"><span className="an-ic" /><span>整理成十格全險圖</span><span className="an-nt" /></div>
        </div>
        <div className="an-why">讀好會出現在保單分析頁下方的<b>「我送出的分析」</b>，按「看結果」就是十格全險圖。不用一直開著這頁。</div>
        <div className="acnext" style={{ marginTop: 15 }}><div className="anx">先做別的</div><button className="abtn" onClick={reset}>回保單分析</button></div>
      </div>
    );
  }

  if (state === "done" && result) {
    const g = result.grid;
    return (
      <>
        <div className="anahd">
          <div><div className="ac1">{result.productName.startsWith(result.company.slice(0, 2)) ? result.productName : `${result.company}　${result.productName}`}</div>
            <div className="ac2">{[result.productType, result.contractType, amount ? `${amount} ${unit}` : null, plan ? `計劃 ${plan}` : null, result.mode === "ai" ? "AI 讀條款產出（佇列）" : result.reviewed ? "資料庫命中 · 公式已審核" : "資料庫命中 · 公式 AI 讀取待審"].filter(Boolean).join(" · ")} · 分析完成</div></div>
          <div className="aact"><button className="abtn" onClick={reset}>再分析一張</button></div>
        </div>
        {(result.mode === "ai" || !result.reviewed) && (
          <div className="anapend" style={{ marginTop: 12 }}><span className="dotp" />這份是 <b>AI 讀出來的，還沒入庫</b>——核對過才會變成資料庫的正式資料，送規劃書前要先核（P4）</div>
        )}
        <FxGridView grid={g} noAmount={!amount} />
      </>
    );
  }

  // 待命
  return (
    <>
      <div className="uparea" style={{ marginTop: 16, cursor: "pointer" }} onClick={() => { setPath("ai"); fileRef.current?.click(); }}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") { setPath("ai"); setFile(f); } }}>
        <svg className="ill i44" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-upload" /></svg>
        <div className="upt">{file ? file.name : "丟一份條款 PDF 進來"}</div>
        <div className="upd">資料庫沒有的會排隊分析；或在下面輸入商品名稱，先找資料庫裡有沒有</div>
        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setPath("ai"); setFile(f); } e.target.value = ""; }} />
      </div>
      <div className="an-pick">
        <button className="an-pk" aria-pressed={path === "db"} onClick={() => { setPath("db"); setFile(null); }}><b>資料庫已收錄</b><span>命中就套已審核的公式，約 3 秒。</span></button>
        <button className="an-pk" aria-pressed={path === "ai"} onClick={() => { setPath("ai"); setPick(null); if (!file) fileRef.current?.click(); }}><b>資料庫沒有這張</b><span>新商品或冷門舊單，排隊讓 AI 讀完條款，好了出現在下方清單。</span></button>
      </div>

      {path === "db" && (
        <div className="acnext" style={{ display: "block" }}>
          <div className="anx" style={{ marginBottom: 8 }}>找商品</div>
          {pick ? (
            <div className="acrr"><div className="acrn"><b>{pick.name}</b><span>{pick.company} · {pick.period}</span></div>
              <button className="abtn" onClick={() => { setPick(null); setQ(""); }}>換一張</button></div>
          ) : (
            <>
              <input className="asrch" style={{ maxWidth: "none", width: "100%" }} placeholder="商品名稱、公司、代號…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
              <div className="acres" style={{ marginTop: 8 }}>{hits.map(h => (
                <div key={h.planCode} className="acrr"><div className="acrn"><b>{h.name}</b><span>{h.company} · {h.period}</span></div>
                  {h.category && <span className="tagx ok">{h.category}</span>}<button className="abtn pri" onClick={() => setPick(h)}>選這張</button></div>
              ))}</div>
            </>
          )}
        </div>
      )}

      {path && (
        <div className="acnext">
          <div className="anx">保額</div>
          <input className="asrch" style={{ minWidth: 96, maxWidth: 140, flex: "1 1 96px" }} inputMode="decimal" placeholder="例：300" value={amount} onChange={e => setAmount(e.target.value)} aria-label="保額數字" />
          <select className="asel" value={unit} onChange={e => setUnit(e.target.value)} aria-label="單位"><option>萬</option><option>元</option><option>單位</option><option>美元</option></select>
          <input className="asrch" style={{ minWidth: 0, maxWidth: 120 }} placeholder="計劃（選填）" value={plan} onChange={e => setPlan(e.target.value)} aria-label="計劃別" />
          <button className="abtn pri big" disabled={!ready} onClick={run}>{path === "ai" ? "送出排隊分析" : "開始分析"}</button>
        </div>
      )}
      {error && <div className="anapend" style={{ marginTop: 12, color: "var(--must)" }}><span className="dotp" style={{ background: "var(--must)" }} />{error}</div>}
      {queue.length > 0 && (
        <div className="acnext" style={{ display: "block" }}>
          <div className="anx" style={{ marginBottom: 8 }}>我送出的分析</div>
          <div className="acres" style={{ marginTop: 0 }}>{queue.map(q => (
            <div key={q.id} className="acrr">
              <div className="acrn"><b>{q.productName ?? q.filename}</b><span>{q.createdAt.slice(0, 16)} 送出{q.doneAt ? ` · ${q.doneAt.slice(0, 16)} 分析好` : ""}{q.note ? ` · ${q.note}` : ""}</span></div>
              <span className={`tagx ${ST[q.status][1]}`} style={q.status === "done" ? undefined : { color: "var(--muted)", background: "var(--sunk)" }}>{ST[q.status][0]}</span>
              {q.status === "done" && <button className="abtn pri" onClick={() => openResult(q.id)}>看結果</button>}
            </div>
          ))}</div>
        </div>
      )}
      <div className="acsrc">要分析客戶的整份保險存摺，從<Link href="/clients" style={{ color: "var(--brand-ink)" }}>客戶頁</Link>進——結果會留在那位客戶身上。</div>
    </>
  );
}
