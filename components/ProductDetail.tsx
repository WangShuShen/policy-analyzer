"use client";

import { useEffect, useState } from "react";
import { Calculator, Loader2, FileText } from "lucide-react";

// ── 型別 ──────────────────────────────────────────────────────────────
interface AnalysisItem {
  name: string; formula?: string; unit?: string; restriction?: string; notes?: string;
  valueSource?: "plan" | "table" | "insured" | "unit" | "fixed";
  isLimit?: boolean;
  planValues?: Record<string, number>;
  tableRange?: { min: number; max: number };
  insuredRate?: { type: "multiplier" | "percentage"; rate?: number; min?: number; max?: number };
  amount?: number;
}
export interface AnalysisData {
  company?: string; productName?: string; planCode?: string;
  items?: AnalysisItem[];
  plans?: string[];
  baseUnit?: string;
  planScale?: boolean;   // 計劃別=等比放大（輸入計劃號 ×N）；否則列舉（選計劃）
  annualLimit?: { formula?: string; notes?: string };
  waitingPeriod?: { note?: string };
  exclusions?: string[];
  specialRestrictions?: string[];
}
interface TrialResult { label: string; type: string; display: string; limit: string; note: string }

// ── 給付顯示文字 ────────────────────────────────────────────────────────
function benefitDisplay(it: AnalysisItem): string {
  const u = it.unit ?? "";
  const n = (v?: number) => (v ?? 0).toLocaleString("zh-TW");
  const lim = it.isLimit ? "限額 " : "";
  switch (it.valueSource) {
    case "fixed": return `${lim}${n(it.amount)} ${u}`;
    case "unit": return `${lim}每單位 ${n(it.amount)} ${u}`;
    case "table": return it.tableRange ? `${lim}${n(it.tableRange.min)} ～ ${n(it.tableRange.max)} ${u}` : (it.formula ?? "");
    case "insured": {
      const r = it.insuredRate; if (!r) return it.formula ?? "";
      const sfx = r.type === "percentage" ? "%" : "倍";
      const pfx = it.isLimit ? "限額＝保額" : "保額";
      if (r.min != null && r.max != null) return `${pfx} × ${r.min}${sfx} ～ ${r.max}${sfx}`;
      return `${pfx} × ${r.rate ?? 1}${sfx}`;
    }
    case "plan": {
      const pv = it.planValues ?? {};
      const parts = Object.entries(pv).map(([k, v]) => `計劃${k}=${n(v)}`);
      return parts.length ? `${lim}${parts.join("、")} ${u}` : (it.formula ?? "");
    }
    default: return it.formula ?? "";
  }
}

// ── 保額試算 ────────────────────────────────────────────────────────────
function TrialPanel({ planCode, analysis }: { planCode: string; analysis: AnalysisData }) {
  const baseUnit = analysis.baseUnit ?? "元";
  const plans = analysis.plans ?? [];
  const isPlanEnum = baseUnit === "計劃別" && !analysis.planScale;     // 列舉：選計劃
  const isPlanScale = baseUnit === "計劃別" && !!analysis.planScale;   // 等比：輸入計劃號
  const isUnit = baseUnit === "單位數";

  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState(plans[0] ?? "");
  const [results, setResults] = useState<TrialResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputLabel = isPlanScale ? "輸入計劃號（等比放大）" : isUnit ? "輸入單位數" : "輸入保額";

  const run = async () => {
    let num = parseFloat(amount);
    if (isPlanEnum) num = 1;                       // 列舉：金額由計劃決定，amount 不影響
    if (!num || num <= 0) { setError(isPlanEnum ? "請選擇計劃別" : "請輸入有效數字"); return; }
    setLoading(true); setError(""); setResults([]);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(planCode)}/trial`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insured_amount: num, unit: baseUnit, plan: isPlanEnum ? plan : undefined }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResults(data.results);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  };

  return (
    <div className="bg-[#FEF9F2] border border-[#EDE0CE] rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-[#C8956C]" />
        <span className="text-sm font-semibold text-[#8B5E3C]">保額試算</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {isPlanEnum ? (
          <select value={plan} onChange={e => setPlan(e.target.value)}
            className="flex-1 min-w-[8rem] text-sm border border-[#E8D5B7] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#C8956C]/20">
            {plans.map(p => <option key={p} value={p}>計劃 {p}</option>)}
          </select>
        ) : (
          <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()} placeholder={inputLabel}
            className="flex-1 min-w-[8rem] text-sm border border-[#E8D5B7] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#C8956C]/20 focus:border-[#C8956C]" />
        )}
        <button onClick={run} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
          試算
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {results.length > 0 && (
        <div className="bg-white border border-[#EDE0CE] rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#FBF0E3] border-b border-[#EDE0CE]">
                <th className="text-left px-3 py-2 text-[#8B5E3C] font-semibold">給付項目</th>
                <th className="text-right px-3 py-2 text-[#8B5E3C] font-semibold">試算金額</th>
                <th className="text-left px-3 py-2 text-[#8B5E3C] font-semibold hidden sm:table-cell">說明</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-[#F5EDE0] last:border-0">
                  <td className="px-3 py-2 text-stone-700 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-right font-bold text-[#8B5E3C] whitespace-nowrap">{r.display}</td>
                  <td className="px-3 py-2 text-stone-400 hidden sm:table-cell">
                    {r.limit && <span className="mr-2">{r.limit}</span>}
                    {r.note && <span className="italic">{r.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 給付資訊 ────────────────────────────────────────────────────────────
function AnalysisInfoPanel({ data }: { data: AnalysisData }) {
  return (
    <div className="space-y-4">
      {data.items && data.items.length > 0 && (
        <div className="bg-white border border-[#EDE0CE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-[#FBF0E3] border-b border-[#EDE0CE]"><span className="text-sm font-semibold text-[#8B5E3C]">📋 給付明細</span></div>
          <table className="w-full text-xs">
            <tbody>
              {data.items.map((it, i) => (
                <tr key={i} className="border-b border-[#F5EDE0] last:border-0">
                  <td className="px-3 py-2.5 text-stone-700 font-medium align-top w-36">{it.name}</td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="text-stone-700 font-medium">{benefitDisplay(it)}</span>
                    {it.restriction && <div className="text-[11px] text-stone-400 mt-0.5">{it.restriction}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(data.annualLimit?.formula || data.waitingPeriod?.note) && (
        <div className="bg-white border border-[#EDE0CE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100"><span className="text-sm font-semibold text-stone-600">📊 給付限制</span></div>
          <div className="px-4 py-3 space-y-2 text-xs">
            {data.annualLimit?.formula && <div><span className="text-stone-400">年度上限：</span><span className="text-stone-700">{data.annualLimit.formula}</span></div>}
            {data.waitingPeriod?.note && <div><span className="text-stone-400">等待期：</span><span className="text-stone-700">{data.waitingPeriod.note}</span></div>}
          </div>
        </div>
      )}
      {((data.exclusions?.length ?? 0) > 0 || (data.specialRestrictions?.length ?? 0) > 0) && (
        <div className="bg-white border border-[#EDE0CE] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100"><span className="text-sm font-semibold text-stone-600">⚠️ 注意事項</span></div>
          <div className="px-4 py-3 space-y-1.5">
            {(data.exclusions ?? []).map((e, i) => <p key={`e${i}`} className="text-xs text-red-600">❌ {e}</p>)}
            {(data.specialRestrictions ?? []).map((r, i) => <p key={`s${i}`} className="text-xs text-indigo-700">• {r}</p>)}
          </div>
        </div>
      )}
      <p className="text-[11px] text-stone-300 text-center pt-2">本資料由 AI 分析、顧問人工審核，僅供參考；實際給付以保單條款為準。</p>
    </div>
  );
}

// ── 主元件：依 planCode 自取資料，呈現 試算 / 給付資訊 / 條款PDF ──────────
export default function ProductDetail({ planCode }: { planCode: string }) {
  const [meta, setMeta] = useState<{ product_name?: string; company?: string; category?: string } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<"trial" | "info" | "pdf">("trial");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetch(`/api/products?planCode=${encodeURIComponent(planCode)}`)
      .then(r => r.json())
      .then(d => { setMeta(d.product ?? null); setAnalysis(d.analysis ?? null); })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [planCode]);

  useEffect(() => {
    let revoke = "";
    fetch(`/api/pdf-proxy?planCode=${encodeURIComponent(planCode)}`)
      .then(res => {
        if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) return res.blob();
        throw new Error("not-pdf");
      })
      .then(blob => { const u = URL.createObjectURL(blob); revoke = u; setPdfUrl(u); setPdfStatus("ok"); })
      .catch(() => setPdfStatus("error"));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [planCode]);

  if (loadingData) {
    return <div className="flex items-center justify-center py-20 text-stone-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const tabs: [typeof tab, string][] = [["trial", "保額試算"], ["info", "給付資訊"], ["pdf", "條款 PDF"]];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* 標題 */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-stone-800">{meta?.product_name ?? analysis?.productName ?? planCode}</h1>
        <p className="text-sm text-stone-500 mt-0.5">{meta?.company ?? analysis?.company ?? ""} <span className="font-mono text-xs text-stone-400 ml-1">{planCode}</span></p>
      </div>

      {/* 分頁 */}
      <div className="flex gap-1 border-b border-[#EDE0CE]">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? "border-[#C8956C] text-[#8B5E3C]" : "border-transparent text-stone-400 hover:text-stone-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "trial" && (
        analysis?.items?.length
          ? <TrialPanel planCode={planCode} analysis={analysis} />
          : <p className="text-sm text-stone-400 py-8 text-center">此商品尚無已審核的給付公式，無法試算。</p>
      )}
      {tab === "info" && (
        analysis ? <AnalysisInfoPanel data={analysis} /> : <p className="text-sm text-stone-400 py-8 text-center">尚無分析資料。</p>
      )}
      {tab === "pdf" && (
        <div className="h-[70vh] bg-stone-100 rounded-xl overflow-hidden relative">
          {pdfStatus === "loading" && <div className="absolute inset-0 flex items-center justify-center text-stone-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {pdfStatus === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
              <FileText className="h-10 w-10" />
              <p className="text-sm">此商品尚未上傳條款 PDF。</p>
            </div>
          )}
          {pdfStatus === "ok" && pdfUrl && <iframe src={pdfUrl} className="w-full h-full border-0" title="保單條款" />}
        </div>
      )}
    </div>
  );
}
