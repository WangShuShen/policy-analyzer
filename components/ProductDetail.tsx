"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2, FileText, ClipboardCheck } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

// ── 型別 ──────────────────────────────────────────────────────────────
interface AnalysisItem {
  name: string; formula?: string; unit?: string; restriction?: string; notes?: string;
  valueSource?: "plan" | "table" | "insured" | "unit" | "fixed" | "note";
  isLimit?: boolean;
  planValues?: Record<string, number>;
  tableRange?: { min: number; max: number };
  insuredRate?: { type: "multiplier" | "percentage"; rate?: number; min?: number; max?: number };
  amount?: number;
}
export interface AnalysisData {
  company?: string; productName?: string; planCode?: string;
  displayCode?: string;   // 商品代號（顧問填，優先顯示）
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
    case "note": return it.formula || "依條款說明";
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

// ── 區塊標題 ────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, children }: { icon: typeof Calculator; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-[#C8956C]" />
      <h2 className="text-sm font-semibold text-[#8B5E3C]">{children}</h2>
    </div>
  );
}

// ── 主元件：依 planCode 自取資料，左右雙欄（給付/試算 ｜ 條款PDF）──────────
export default function ProductDetail({ planCode }: { planCode: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<{ product_name?: string; company?: string; category?: string } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [docIds, setDocIds] = useState<{ clause: string | null; rate: string | null; spec: string | null }>({ clause: null, rate: null, spec: null });
  const [docTab, setDocTab] = useState<"clause" | "rate" | "spec">("clause");
  const [loadingData, setLoadingData] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"loading" | "ok" | "error">("loading");
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  useEffect(() => {
    fetch(`/api/products?planCode=${encodeURIComponent(planCode)}`)
      .then(r => r.json())
      .then(d => {
        setMeta(d.product ?? null);
        setAnalysis(d.analysis ?? null);
        setDocIds({ clause: d.pdfDriveId ?? null, rate: d.rateDriveId ?? null, spec: d.specDriveId ?? null });
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [planCode]);

  // PDF 來源同審核頁：本地 / Google Drive；條款/費率/說明三種文件依分頁切換
  useEffect(() => {
    if (loadingData) return;
    const driveId = docIds[docTab];
    setPdfUrl(null);
    if (!driveId) { setPdfStatus("error"); return; }
    let revoke = "";
    // 只有條款有本地檔（{planCode}.pdf）；費率/說明僅用 driveId，避免本地檔誤抓條款
    const q = new URLSearchParams();
    if (docTab === "clause") q.set("planCode", planCode);
    q.set("driveId", driveId);
    setPdfStatus("loading");
    fetch(`/api/pdf-proxy/local?${q.toString()}`)
      .then(res => {
        if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) return res.blob();
        throw new Error("not-pdf");
      })
      .then(blob => { const u = URL.createObjectURL(blob); revoke = u; setPdfUrl(u); setPdfStatus("ok"); })
      .catch(() => setPdfStatus("error"));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [planCode, docIds, docTab, loadingData]);

  // 重新審核：送回審核佇列、跳轉到編輯頁
  const reopen = async () => {
    if (reopening) return;
    setConfirmReopen(false);
    setReopening(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(planCode)}/reopen`, { method: "POST" });
      const data = await res.json();
      if (data.error || !data.uuid) { alert(data.error ?? "重新審核失敗"); return; }
      router.push(`/review/${encodeURIComponent(data.uuid)}`);
    } catch (e) {
      alert(String(e));
    } finally {
      setReopening(false);
    }
  };

  if (loadingData) {
    return <div className="flex items-center justify-center py-20 text-stone-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-[100rem] mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* 標題 + 重新審核 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-stone-800">{analysis?.productName ?? meta?.product_name ?? planCode}</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {analysis?.company ?? meta?.company ?? ""}
            <span className="font-mono text-xs text-[#8B5E3C] ml-1">代號 {analysis?.displayCode || planCode}</span>
            {analysis?.displayCode && <span className="font-mono text-[10px] text-stone-300 ml-1">系統碼 {planCode}</span>}
          </p>
        </div>
        <button onClick={() => setConfirmReopen(true)} disabled={reopening}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[#8B5E3C] border border-[#E8D5B7] bg-white hover:bg-[#FBF0E3] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0">
          {reopening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
          重新審核
        </button>
      </div>

      <ConfirmModal
        open={confirmReopen}
        title="重新審核"
        message="確定要重新審核這個商品嗎？將送回審核佇列並進入編輯頁。"
        confirmText="送回審核"
        loading={reopening}
        onConfirm={reopen}
        onCancel={() => setConfirmReopen(false)}
      />

      {/* 左右雙欄：左=給付資訊+試算（可捲）｜ 右=PDF（黏頂、滿高）。窄螢幕自動上下堆疊 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左欄 */}
        <div className="space-y-6 lg:max-h-[calc(100vh-9rem)] lg:overflow-auto lg:pr-1">
          <section>
            <SectionTitle icon={Calculator}>保額試算</SectionTitle>
            {analysis?.items?.length
              ? <TrialPanel planCode={planCode} analysis={analysis} />
              : <p className="text-sm text-stone-400 py-8 text-center">此商品尚無已審核的給付公式，無法試算。</p>}
          </section>
          <section>
            <SectionTitle icon={FileText}>給付資訊</SectionTitle>
            {analysis ? <AnalysisInfoPanel data={analysis} /> : <p className="text-sm text-stone-400 py-8 text-center">尚無分析資料。</p>}
          </section>
        </div>

        {/* 右欄：PDF（條款 / 費率 / 說明 分頁）*/}
        <section className="lg:sticky lg:top-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#C8956C]" />
              <h2 className="text-sm font-semibold text-[#8B5E3C]">文件</h2>
            </div>
            <div className="inline-flex rounded-lg overflow-hidden border border-[#E8D5B7] text-xs">
              {([["clause", "條款"], ["rate", "費率"], ["spec", "說明"]] as ["clause" | "rate" | "spec", string][]).map(([t, label], i) => {
                const has = !!docIds[t];
                return (
                  <button key={t} type="button" onClick={() => setDocTab(t)}
                    className={`px-3 py-1 ${i > 0 ? "border-l border-[#E8D5B7]" : ""} ${docTab === t ? "bg-[#C8956C] text-white font-medium" : has ? "bg-white text-stone-600 hover:bg-[#FBF0E3]" : "bg-white text-stone-300"}`}>
                    {label}{!has && " ·無"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="h-[60vh] lg:h-[calc(100vh-12rem)] bg-stone-100 rounded-xl overflow-hidden relative">
            {pdfStatus === "loading" && <div className="absolute inset-0 flex items-center justify-center text-stone-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {pdfStatus === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
                <FileText className="h-10 w-10" />
                <p className="text-sm">此商品尚未提供{docTab === "clause" ? "條款" : docTab === "rate" ? "費率" : "說明"} PDF。</p>
              </div>
            )}
            {pdfStatus === "ok" && pdfUrl && <iframe src={pdfUrl} className="w-full h-full border-0" title="保單文件" />}
          </div>
        </section>
      </div>
    </div>
  );
}
