"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload, FileText, ImageIcon, Loader2, CheckCircle,
  Zap, PenLine, X, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InsuranceChart from "@/components/InsuranceChart";

// ── Types ──────────────────────────────────────────────────────────────

type AmountType = "計劃別" | "單位數" | "保額";

interface PolicyEntry {
  id: string;
  file: File;
  amountType: AmountType;
  amountValue: string;
  planCode: string;
  planType: string;
  year: string;
  planOptions: { label: string; value: string }[];
  prefillStatus: "idle" | "loading" | "done";
  analyzeStatus: "idle" | "analyzing" | "done" | "error";
  result: Record<string, unknown> | null;
  errorMsg: string;
}

interface SuspiciousField {
  field: string;
  severity: "high" | "medium" | "low";
  issueType: string;
  detail: string;
  currentValue: string;
  suggestedValue: string;
}

interface VerificationResult {
  overallConfidence: number;
  suspiciousFields: SuspiciousField[];
  missingItems: string[];
}

// ── Aggregated coverage summary ───────────────────────────────────────

const COVERAGE_ROWS: {
  key: string;
  label: string;
  emoji: string;
  extract: (d: Record<string, unknown>) => string | undefined;
}[] = [
  { key: "life", label: "壽險", emoji: "❤️", extract: d => (d.life as Record<string,string>|undefined)?.amount },
  { key: "fixedMedical", label: "定額醫療", emoji: "📋", extract: d => (d.fixedMedical as Record<string,string>|undefined)?.hospitalDaily },
  { key: "medicalReimbursement", label: "實支實付", emoji: "🧾", extract: d => (d.medicalReimbursement as Record<string,string>|undefined)?.hospitalRoom },
  { key: "accident", label: "意外險", emoji: "⚡", extract: d => (d.accident as Record<string,string>|undefined)?.deathDisability },
  { key: "cancer", label: "防癌險", emoji: "🎗️", extract: d => (d.cancer as Record<string,string>|undefined)?.initialCancer || (d.cancer as Record<string,string>|undefined)?.invasiveCancer },
  { key: "criticalIllnessCard", label: "重大傷病卡", emoji: "💳", extract: d => (d.criticalIllnessCard as Record<string,string>|undefined)?.amount },
  { key: "majorDisease", label: "重特大疾病", emoji: "🏥", extract: d => (d.majorDisease as Record<string,string>|undefined)?.sevenItems || (d.majorDisease as Record<string,string>|undefined)?.twentyTwoItems },
  { key: "longTermCare", label: "長照險", emoji: "🧓", extract: d => (d.longTermCare as Record<string,string>|undefined)?.annualBenefit || (d.longTermCare as Record<string,string>|undefined)?.lumpSum },
  { key: "disability", label: "失能險", emoji: "♿", extract: d => (d.disability as Record<string,string>|undefined)?.grade1to6 },
];

function AggregatedSummary({ policies }: { policies: PolicyEntry[] }) {
  const done = policies.filter(p => p.result);
  return (
    <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-2 pt-5 px-5 bg-[#FBF0E3]/40">
        <CardTitle className="text-base font-semibold text-stone-700 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-[#C8956C]" />
          保戶保障總覽
          <span className="text-xs font-normal text-stone-400 ml-1">{done.length} 張保單</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EDE0CE] bg-[#FBF0E3]/20">
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-400 w-32 shrink-0">保障類別</th>
                {done.map(p => {
                  const d = p.result as Record<string, unknown> | null;
                  const company = (d?.company as string) || p.file.name.replace(/\.pdf$/i, "");
                  const pName = (d?.policyName as string) || "";
                  return (
                    <th key={p.id} className="text-center px-3 py-3 text-xs font-semibold text-stone-600 max-w-40">
                      <span className="block truncate">{company}</span>
                      {pName && <span className="block text-[10px] text-stone-400 font-normal mt-0.5 truncate">{pName}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COVERAGE_ROWS.map(row => {
                const values = done.map(p => p.result ? row.extract(p.result) : undefined);
                if (!values.some(v => v)) return null;
                return (
                  <tr key={row.key} className="border-b border-[#F5EDE0] last:border-0 hover:bg-[#FBF0E3]/20 transition-colors">
                    <td className="px-5 py-3 text-stone-600 font-medium whitespace-nowrap text-sm">
                      {row.emoji} {row.label}
                    </td>
                    {values.map((v, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        {v ? (
                          <span className="text-xs text-stone-800 font-medium">{v.split("｜")[0]}</span>
                        ) : (
                          <span className="text-stone-200 text-xs">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Verification panel (single policy only) ────────────────────────────

function VerificationPanel({ v }: { v: VerificationResult }) {
  const { overallConfidence, suspiciousFields, missingItems } = v;
  const confidenceBg =
    overallConfidence >= 90 ? "bg-emerald-50 border-emerald-200" :
    overallConfidence >= 70 ? "bg-amber-50 border-amber-200" :
    "bg-red-50 border-red-200";
  const confidenceText =
    overallConfidence >= 90 ? "text-emerald-700" :
    overallConfidence >= 70 ? "text-amber-700" :
    "text-red-700";
  const severityConfig = {
    high:   { bg: "bg-red-100 text-red-700",    label: "高風險" },
    medium: { bg: "bg-amber-100 text-amber-700", label: "中風險" },
    low:    { bg: "bg-stone-100 text-stone-500", label: "低風險" },
  };
  if (suspiciousFields.length === 0 && missingItems.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-700">
        <CheckCircle className="h-4 w-4 shrink-0" />
        稽核通過，未發現明顯問題（信心分數：{overallConfidence}/100）
      </div>
    );
  }
  return (
    <Card className={`border rounded-2xl shadow-sm ${confidenceBg}`}>
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-stone-700">🔍 AI 稽核報告</CardTitle>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${confidenceText} ${confidenceBg} border`}>
            信心分數 {overallConfidence}/100
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        {suspiciousFields.map((f, i) => {
          const cfg = severityConfig[f.severity];
          return (
            <div key={i} className="bg-white border border-stone-100 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs text-stone-500 bg-stone-50 px-1.5 py-0.5 rounded font-mono">{f.field}</code>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>{cfg.label}</span>
                  <span className="text-xs text-stone-400">{f.issueType}</span>
                </div>
              </div>
              <p className="text-sm text-stone-700 leading-snug">{f.detail}</p>
              {f.currentValue && <p className="text-xs text-stone-400">目前值：<span className="font-mono">{f.currentValue}</span></p>}
              {f.suggestedValue && <p className="text-xs text-emerald-600">建議值：<span className="font-mono font-semibold">{f.suggestedValue}</span></p>}
            </div>
          );
        })}
        {missingItems.length > 0 && (
          <div className="bg-white border border-amber-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ 條款有但未記錄的給付項目</p>
            <ul className="space-y-1">
              {missingItems.map((item, i) => (
                <li key={i} className="text-sm text-stone-600 flex items-start gap-1.5">
                  <span className="text-stone-300 shrink-0 mt-0.5">·</span>{item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── FieldInput helper ──────────────────────────────────────────────────

function FieldInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-stone-400 font-medium">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

let idCounter = 0;
function newId() { return String(++idCounter); }

export default function AnalyzePage() {
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  // Single-policy extras (verification + correction)
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionField, setCorrectionField] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load prefilled data from sessionStorage (set by history/catalog pages)
  useEffect(() => {
    const raw = sessionStorage.getItem("analyze_prefill");
    if (raw) {
      try {
        const { data, pid } = JSON.parse(raw);
        const entry: PolicyEntry = {
          id: newId(),
          file: new File([], "cached"),
          amountType: "保額",
          amountValue: "",
          planCode: "",
          planType: "",
          year: "",
          planOptions: [],
          prefillStatus: "done",
          analyzeStatus: "done",
          result: data,
          errorMsg: "",
        };
        setPolicies([entry]);
        setProductId(pid ?? null);
        setFromCache(true);
        setActiveTab(entry.id);
      } catch { /* ignore */ }
      sessionStorage.removeItem("analyze_prefill");
    }
  }, []);

  const updateEntry = (id: string, updates: Partial<PolicyEntry>) => {
    setPolicies(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const runPrefill = async (entry: PolicyEntry) => {
    updateEntry(entry.id, { prefillStatus: "loading" });
    try {
      const fd = new FormData();
      fd.append("files", entry.file);
      const res = await fetch("/api/prefill", { method: "POST", body: fd });
      const data = await res.json();
      const updates: Partial<PolicyEntry> = { prefillStatus: "done" };
      if (data.planCode) updates.planCode = data.planCode;
      if (data.year) updates.year = data.year;
      if (data.planType) updates.planType = data.planType;
      if (Array.isArray(data.planOptions) && data.planOptions.length > 0) {
        updates.planOptions = data.planOptions;
        updates.amountType = "計劃別";
      }
      updateEntry(entry.id, updates);
    } catch {
      updateEntry(entry.id, { prefillStatus: "done" });
    }
  };

  const addFiles = (incoming: FileList | File[]) => {
    const allowed = Array.from(incoming).filter(
      f => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (allowed.length === 0) return;

    const newEntries: PolicyEntry[] = allowed.map(f => ({
      id: newId(),
      file: f,
      amountType: "保額" as AmountType,
      amountValue: "",
      planCode: "",
      planType: "",
      year: "",
      planOptions: [],
      prefillStatus: "idle",
      analyzeStatus: "idle",
      result: null,
      errorMsg: "",
    }));

    setPolicies(prev => {
      const existing = new Set(prev.map(e => e.file.name + e.file.size));
      return [...prev, ...newEntries.filter(e => !existing.has(e.file.name + e.file.size))];
    });

    // Run prefill for each new entry
    newEntries.forEach(entry => runPrefill(entry));

    setVerification(null);
    setFromCache(false);
    setProductId(null);
    setCorrectionSaved(false);
    setActiveTab("summary");
  };

  const removeEntry = (id: string) => {
    setPolicies(prev => prev.filter(e => e.id !== id));
  };

  const analyzeEntry = async (entry: PolicyEntry) => {
    if (!entry.amountValue) return;
    updateEntry(entry.id, { analyzeStatus: "analyzing", result: null, errorMsg: "" });
    try {
      const fd = new FormData();
      fd.append("files", entry.file);
      fd.append("amount", entry.amountValue);
      if (entry.planType) fd.append("planType", entry.planType);
      if (entry.planCode) fd.append("planCode", entry.planCode);
      if (entry.year) fd.append("year", entry.year);
      fd.append("force", "true");
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      updateEntry(entry.id, { analyzeStatus: "done", result: json.data });
      if (policies.length === 1) {
        setProductId(json.productId ?? null);
        setFromCache(false);
      }
    } catch (e) {
      updateEntry(entry.id, { analyzeStatus: "error", errorMsg: String(e) });
    }
  };

  const handleAnalyzeAll = async () => {
    const targets = policies.filter(p => p.analyzeStatus === "idle" && p.amountValue);
    if (targets.length === 0) return;

    // Analyze up to 3 in parallel, then continue
    const chunks = [];
    for (let i = 0; i < targets.length; i += 3) chunks.push(targets.slice(i, i + 3));
    for (const chunk of chunks) {
      await Promise.all(chunk.map(e => analyzeEntry(e)));
    }

    // Switch to summary tab after all done
    setActiveTab("summary");
  };

  const handleVerify = async () => {
    const single = policies[0];
    if (!single?.result) return;
    setVerifying(true);
    setVerification(null);
    try {
      const fd = new FormData();
      fd.append("files", single.file);
      fd.append("analysisJson", JSON.stringify(single.result));
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const json = await res.json();
      if (json.verification) setVerification(json.verification);
    } catch { /* ignore */ }
    finally { setVerifying(false); }
  };

  const handleCorrection = async () => {
    if (!productId || !correctionField || !correctionValue) return;
    const res = await fetch("/api/correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, fieldPath: correctionField, newValue: correctionValue, note: correctionNote || undefined }),
    });
    if (res.ok) {
      setCorrectionSaved(true);
      setCorrecting(false);
      setCorrectionField(""); setCorrectionValue(""); setCorrectionNote("");
    }
  };

  const allDone = policies.length > 0 && policies.every(p => p.analyzeStatus === "done" || p.analyzeStatus === "error");
  const anyResult = policies.some(p => p.result);
  const canAnalyzeAll = policies.some(p => p.analyzeStatus === "idle" && p.amountValue);
  const isMulti = policies.length > 1;

  const tabId = (p: PolicyEntry) => `policy-${p.id}`;

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          保單分析
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">
          {isMulti ? `上傳保戶全部保單，AI 逐張解析並產出保障總覽` : "上傳保單條款，AI 自動解析填入全險圖"}
        </p>
      </div>

      <div className="w-full px-8 py-6 space-y-5 overflow-auto flex-1">

        {/* Upload card */}
        <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
          <CardHeader className="pb-3 pt-5 px-6">
            <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#C8956C]" />
              上傳保單條款
              {isMulti && (
                <span className="ml-auto text-[11px] font-normal text-[#C8956C] bg-[#FBF0E3] px-2 py-0.5 rounded-full">
                  保戶模式：每個 PDF = 一張獨立保單
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragOver ? "border-[#C8956C] bg-[#FEF9F2]" : "border-[#E8D5B7] hover:border-[#C8956C] hover:bg-[#FEF9F2]/60"
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FBF0E3] flex items-center justify-center mx-auto mb-3">
                <Upload className="h-5 w-5 text-[#C8956C]" />
              </div>
              <p className="text-stone-600 font-medium text-sm">拖曳檔案到這裡，或點擊選擇</p>
              <p className="text-stone-400 text-xs mt-1">
                支援 PDF、JPG、PNG · 每個 PDF 視為一張獨立保單
              </p>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                multiple
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Policy rows */}
            {policies.length > 0 && (
              <div className="space-y-2">
                {policies.map(entry => (
                  <PolicyRow
                    key={entry.id}
                    entry={entry}
                    onChange={updateEntry}
                    onRemove={removeEntry}
                  />
                ))}
              </div>
            )}

            {/* Analyze button */}
            {policies.length > 0 && (
              <button
                onClick={handleAnalyzeAll}
                disabled={!canAnalyzeAll}
                className="w-full py-3 rounded-2xl font-semibold text-sm transition-all text-white flex items-center justify-center gap-2 shadow-sm"
                style={
                  !canAnalyzeAll
                    ? { background: "#E8D5B7", color: "#B8A090", cursor: "not-allowed" }
                    : { background: "linear-gradient(135deg, #C8956C, #A0714F)" }
                }
              >
                {policies.some(p => p.analyzeStatus === "analyzing") ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />AI 解析中，請稍候…</>
                ) : isMulti ? (
                  `🔍 分析全部 ${policies.filter(p => p.analyzeStatus === "idle" && p.amountValue).length} 張保單`
                ) : (
                  "🔍 開始分析，填入全險圖"
                )}
              </button>
            )}

            {/* Single policy cache indicator */}
            {!isMulti && fromCache && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-700">
                <Zap className="h-4 w-4" />
                從資料庫快取取得，已套用所有修正記錄
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results section */}
        {anyResult && (
          <>
            {isMulti ? (
              /* ── Multi-policy: tabs ── */
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-white border border-[#EDE0CE] shadow-sm rounded-xl flex-wrap h-auto gap-1 p-1">
                  <TabsTrigger
                    value="summary"
                    className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm"
                  >
                    📊 保障總覽
                  </TabsTrigger>
                  {policies.filter(p => p.result).map(p => {
                    const d = p.result as Record<string, unknown> | null;
                    const label = (d?.company as string) || p.file.name.replace(/\.pdf$/i, "").slice(0, 10);
                    return (
                      <TabsTrigger
                        key={p.id}
                        value={tabId(p)}
                        className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm"
                      >
                        {label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <TabsContent value="summary">
                  <AggregatedSummary policies={policies} />
                </TabsContent>

                {policies.filter(p => p.result).map(p => (
                  <TabsContent key={p.id} value={tabId(p)}>
                    <InsuranceChart data={p.result!} />
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              /* ── Single policy: original layout ── */
              <>
                {verification && <VerificationPanel v={verification} />}

                <Tabs defaultValue="chart">
                  <div className="flex items-center justify-between mb-3">
                    <TabsList className="bg-white border border-[#EDE0CE] shadow-sm rounded-xl">
                      <TabsTrigger value="chart" className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm">
                        📊 全險圖
                      </TabsTrigger>
                      <TabsTrigger value="raw" className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm">
                        🔍 原始資料
                      </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                      {policies[0]?.file.name !== "cached" && policies[0]?.analyzeStatus === "done" && (
                        <button
                          onClick={handleVerify}
                          disabled={verifying}
                          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-violet-600 transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white disabled:opacity-50"
                        >
                          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "🔍"}
                          {verifying ? "稽核中…" : "稽核分析"}
                        </button>
                      )}
                      {productId && (
                        <button
                          onClick={() => setCorrecting(!correcting)}
                          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-[#8B5E3C] transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white"
                        >
                          <PenLine className="h-3.5 w-3.5" />
                          修正欄位
                        </button>
                      )}
                    </div>
                  </div>

                  {correcting && productId && (
                    <Card className="bg-[#FEF9F2] border-[#E8D5B7] shadow-sm rounded-2xl mb-4">
                      <CardContent className="px-5 py-4 space-y-3">
                        <p className="text-xs text-stone-500">修正後會儲存到資料庫，下次同商品自動套用</p>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <FieldInput label="欄位路徑" value={correctionField} onChange={setCorrectionField} placeholder="例：fixedMedical.icu" />
                          <FieldInput label="正確值" value={correctionValue} onChange={setCorrectionValue} placeholder="例：2,000元/日（限180日）" />
                          <FieldInput label="備注（選填）" value={correctionNote} onChange={setCorrectionNote} placeholder="例：日額×2，非×1" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCorrection}
                            disabled={!correctionField || !correctionValue}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                            style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
                          >
                            儲存修正
                          </button>
                          <button
                            onClick={() => setCorrecting(false)}
                            className="px-4 py-2 rounded-xl text-sm text-stone-500 border border-[#EDE0CE] bg-white"
                          >
                            取消
                          </button>
                        </div>
                        {correctionSaved && (
                          <p className="text-emerald-600 text-xs flex items-center gap-1.5">
                            <CheckCircle className="h-3 w-3" />修正已儲存，下次同商品自動套用
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <TabsContent value="chart">
                    <InsuranceChart data={policies[0]?.result ?? {}} />
                  </TabsContent>
                  <TabsContent value="raw">
                    <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
                      <CardContent className="pt-4 px-5">
                        <pre className="text-xs text-stone-500 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                          {JSON.stringify(policies[0]?.result, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}

        {/* Error display */}
        {allDone && policies.some(p => p.analyzeStatus === "error") && (
          <div className="space-y-2">
            {policies.filter(p => p.analyzeStatus === "error").map(p => (
              <p key={p.id} className="text-red-500 text-sm bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">
                {p.file.name}：{p.errorMsg}
              </p>
            ))}
          </div>
        )}

      </div>
    </>
  );
}

// ── PolicyRow component ────────────────────────────────────────────────

function PolicyRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: PolicyEntry;
  onChange: (id: string, updates: Partial<PolicyEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const isImage = entry.file.type.startsWith("image/");
  const busy = entry.analyzeStatus === "analyzing";
  const done = entry.analyzeStatus === "done";

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-xl text-sm transition-all ${
      done ? "bg-emerald-50 border-emerald-100" :
      entry.analyzeStatus === "error" ? "bg-red-50 border-red-100" :
      busy ? "bg-[#FBF0E3] border-[#EDE0CE]" :
      "bg-[#FEF9F2] border-[#EDE0CE]"
    }`}>
      {/* Icon */}
      {isImage
        ? <ImageIcon className="h-4 w-4 text-sky-500 shrink-0" />
        : <FileText className="h-4 w-4 text-rose-400 shrink-0" />
      }

      {/* Filename */}
      <span className="text-stone-700 flex-1 min-w-0 truncate text-xs">{entry.file.name}</span>

      {/* Amount type selector */}
      <select
        value={entry.amountType}
        onChange={e => onChange(entry.id, { amountType: e.target.value as AmountType, amountValue: "", planOptions: [] })}
        disabled={busy || done}
        className="text-xs border border-[#E8D5B7] rounded-lg px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:border-[#C8956C] shrink-0 disabled:opacity-50"
      >
        <option value="計劃別">計劃別</option>
        <option value="單位數">單位數</option>
        <option value="保額">保額</option>
      </select>

      {/* Amount value */}
      <div className="w-32 shrink-0">
        {entry.amountType === "計劃別" && entry.planOptions.length > 0 ? (
          <select
            value={entry.amountValue}
            onChange={e => onChange(entry.id, { amountValue: e.target.value })}
            disabled={busy || done}
            className="w-full text-xs border border-[#E8D5B7] rounded-lg px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:border-[#C8956C] disabled:opacity-50"
          >
            <option value="">選擇計劃</option>
            {entry.planOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={entry.amountValue}
            onChange={e => onChange(entry.id, { amountValue: e.target.value })}
            disabled={busy || done}
            placeholder={
              entry.amountType === "計劃別" ? "例：計劃1" :
              entry.amountType === "單位數" ? "例：3" : "例：100萬"
            }
            className="w-full text-xs border border-[#E8D5B7] rounded-lg px-2 py-1.5 bg-white text-stone-700 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] disabled:opacity-50"
          />
        )}
      </div>

      {/* Status */}
      <div className="w-20 shrink-0 text-right">
        {entry.prefillStatus === "loading" && (
          <span className="text-[10px] text-[#C8956C] flex items-center gap-1 justify-end">
            <Loader2 className="h-3 w-3 animate-spin" />偵測中
          </span>
        )}
        {busy && (
          <span className="text-[10px] text-amber-600 flex items-center gap-1 justify-end">
            <Loader2 className="h-3 w-3 animate-spin" />分析中
          </span>
        )}
        {done && (
          <span className="text-[10px] text-emerald-600 flex items-center gap-1 justify-end">
            <CheckCircle className="h-3 w-3" />完成
          </span>
        )}
        {entry.analyzeStatus === "error" && (
          <span className="text-[10px] text-red-500">✗ 失敗</span>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(entry.id)}
        disabled={busy}
        className="text-stone-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-30"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
