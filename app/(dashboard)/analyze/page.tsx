"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogRow } from "@/lib/catalog/search";
import type { FxGrid } from "@/lib/advisor/fxgrid";
import { FxGridView } from "@/components/advisor/FxGridView";

/*
 * 保單分析（原型 SCREENS.advanalyze）：單張商品 → 十格全險圖。整份保險存摺的解析從客戶頁進入。
 *   ①待命：丟條款 PDF，或選「資料庫已收錄／資料庫沒有這張」
 *   ②分析中：逐步列出在做什麼——一個進度條不會告訴你它漏了重大燒燙傷
 *   ③結果：十格全險圖；AI 讀出來的標「還沒入庫」
 * 原型的「存到客戶」「AI 建議的商品」「加入規劃看差異」「AI 分析師」屬 W2／W4，這裡先不做。
 * 舊版（多張上傳、AI 驗證、欄位更正）備份在 backups/legacy-brand/analyze-page.old.tsx，API 仍保留。
 */
type Result = {
  mode: "db" | "ai"; reviewed: boolean; company: string; productName: string; planCode: string | null; productType: string | null;
  contractType: string | null; period: string | null; baseUnit: string | null; plans: string[]; grid: FxGrid;
};
const STEPS = {
  db: [["讀取商品名稱與保額", ""], ["比對保單資料庫", ""], ["取出給付公式", ""], ["套保額算出十格給付", ""]],
  ai: [["讀取條款 PDF", ""], ["辨識險種", ""], ["逐項抽取給付條款", "最花時間的一步"], ["判斷給付單位（保額／單位／計劃／定額）", ""], ["整理成十格全險圖", ""], ["標記為待審核，暫不入庫", ""]],
};
const MS = { db: 700, ai: 7000 };

export default function AnalyzePage() {
  const [state, setState] = useState<"idle" | "run" | "done">("idle");
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

  const run = async () => {
    const mode = path!; const my = ++runRef.current;
    setState("run"); setError(""); setStep(0); setElapsed(0); setResult(null);
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (runRef.current !== my) { clearInterval(tick); return; }
      const e = (Date.now() - t0) / 1000; setElapsed(e);
      setStep(Math.min(STEPS[mode].length - 1, Math.floor(e * 1000 / MS[mode])));
    }, 100);
    const held = { amount: amount ? Number(amount.replace(/,/g, "")) : null, unit: unit || null, plan: plan || null };
    let r: Response | null;
    if (mode === "db") r = await fetch("/api/advisor/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode: pick!.planCode, ...held }) }).catch(() => null);
    else {
      const fd = new FormData(); fd.append("file", file!);
      if (held.amount) fd.append("amount", String(held.amount)); if (held.unit) fd.append("unit", held.unit); if (held.plan) fd.append("plan", held.plan);
      r = await fetch("/api/advisor/analyze", { method: "POST", body: fd }).catch(() => null);
    }
    clearInterval(tick);
    if (runRef.current !== my) return;
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setState("idle"); setError(j.error ?? "分析沒有成功，請再試一次"); return; }
    setStep(STEPS[mode].length); setResult(j); setState("done");
  };

  const reset = () => { runRef.current++; setState("idle"); setPath(null); setPick(null); setFile(null); setResult(null); setQ(""); setAmount(""); setPlan(""); };
  const ready = path === "db" ? !!pick : path === "ai" ? !!file : false;

  if (state === "run") {
    const steps = STEPS[path!];
    return (
      <div className="an-run">
        <div className="an-hd"><span className="an-t">{path === "db" ? pick!.name : file!.name}</span><span className="an-el">{elapsed.toFixed(1)} 秒</span></div>
        <div className="ac2" style={{ margin: "-6px 0 12px" }}>{path === "db" ? "資料庫已收錄 · 直接套給付公式" : "資料庫沒有這張 · 要跑 AI 讀條款（約 40 秒）"}</div>
        <div className="an-steps">{steps.map(([lab, nt], i) => (
          <div key={lab} className={`an-st ${i < step ? "ok" : i === step ? "on" : ""}`}><span className="an-ic" /><span>{lab}</span><span className="an-nt">{nt}</span></div>
        ))}</div>
        <div className="an-why">{path === "ai"
          ? <>讀完會逐條列出讀到什麼，顧問才知道 AI 有沒有漏讀——<b>一個進度條不會告訴你它漏了重大燒燙傷</b>。</>
          : <>命中資料庫時公式是人工審核過的，所以這條路不只是快，<b>準確度也不一樣</b>。</>}</div>
        <div className="acnext" style={{ marginTop: 15 }}><div className="anx">不想等</div><button className="abtn" onClick={reset}>取消這次分析</button></div>
      </div>
    );
  }

  if (state === "done" && result) {
    const g = result.grid;
    return (
      <>
        <div className="anahd">
          <div><div className="ac1">{result.productName.startsWith(result.company.slice(0, 2)) ? result.productName : `${result.company}　${result.productName}`}</div>
            <div className="ac2">{[result.productType, result.contractType, amount ? `${amount} ${unit}` : null, plan ? `計劃 ${plan}` : null, result.mode === "ai" ? "AI 讀條款產出" : result.reviewed ? "資料庫命中 · 公式已審核" : "資料庫命中 · 公式 AI 讀取待審"].filter(Boolean).join(" · ")} · 分析完成</div></div>
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
        <div className="upd">或在下面輸入商品名稱，系統先找資料庫裡有沒有</div>
        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setPath("ai"); setFile(f); } e.target.value = ""; }} />
      </div>
      <div className="an-pick">
        <button className="an-pk" aria-pressed={path === "db"} onClick={() => { setPath("db"); setFile(null); }}><b>資料庫已收錄</b><span>命中就套已審核的公式，約 3 秒。</span></button>
        <button className="an-pk" aria-pressed={path === "ai"} onClick={() => { setPath("ai"); setPick(null); if (!file) fileRef.current?.click(); }}><b>資料庫沒有這張</b><span>新商品或冷門舊單，要 AI 讀完條款，約 40 秒。</span></button>
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
          <button className="abtn pri big" disabled={!ready} onClick={run}>開始分析</button>
        </div>
      )}
      {error && <div className="anapend" style={{ marginTop: 12, color: "var(--must)" }}><span className="dotp" style={{ background: "var(--must)" }} />{error}</div>}
      <div className="acsrc">要分析客戶的整份保險存摺，從<Link href="/clients" style={{ color: "var(--brand-ink)" }}>客戶頁</Link>進——結果會留在那位客戶身上。</div>
    </>
  );
}
