"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload, FileText, ImageIcon, Loader2, CheckCircle,
  Zap, PenLine, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InsuranceChart from "@/components/InsuranceChart";

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
          <CardTitle className="text-base font-semibold text-stone-700 flex items-center gap-2">
            🔍 AI 稽核報告
          </CardTitle>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${confidenceText} ${confidenceBg} border`}>
            信心分數 {overallConfidence}/100
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        {suspiciousFields.length > 0 && (
          <div className="space-y-2">
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
          </div>
        )}
        {missingItems.length > 0 && (
          <div className="bg-white border border-amber-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ 條款有但未記錄的給付項目</p>
            <ul className="space-y-1">
              {missingItems.map((item, i) => (
                <li key={i} className="text-sm text-stone-600 flex items-start gap-1.5">
                  <span className="text-stone-300 shrink-0 mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FileIcon({ file }: { file: File }) {
  return file.type.startsWith("image/")
    ? <ImageIcon className="h-4 w-4 text-sky-500 shrink-0" />
    : <FileText className="h-4 w-4 text-rose-400 shrink-0" />;
}

function FieldInput({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-stone-400 font-medium">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
      />
    </div>
  );
}

export default function AnalyzePage() {
  const formatAmountOnBlur = (val: string) => {
    const stripped = val.replace(/[,，\s元]/g, "");
    if (/^\d+$/.test(stripped)) {
      const num = parseInt(stripped, 10);
      if (num >= 10000) {
        setAmount(`${num / 10000}萬`);
      }
    }
  };

  const [files, setFiles] = useState<File[]>([]);
  const [amount, setAmount] = useState("");
  const [planType, setPlanType] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [planOptions, setPlanOptions] = useState<{ label: string; value: string }[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [savedAs, setSavedAs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionField, setCorrectionField] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load prefilled data from sessionStorage (set by history/catalog pages)
  useEffect(() => {
    const raw = sessionStorage.getItem("analyze_prefill");
    if (raw) {
      try {
        const { data, pid } = JSON.parse(raw);
        setResult(data);
        setProductId(pid ?? null);
        setFromCache(true);
      } catch { /* ignore */ }
      sessionStorage.removeItem("analyze_prefill");
    }
  }, []);

  const triggerPrefill = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setPrefilling(true);
    try {
      const fd = new FormData();
      newFiles.forEach(f => fd.append("files", f));
      const res = await fetch("/api/prefill", { method: "POST", body: fd });
      const data = await res.json();
      if (data.planCode && !planCode) setPlanCode(data.planCode);
      if (data.year && !year) setYear(data.year);
      if (data.planType && !planType) setPlanType(data.planType);
      if (Array.isArray(data.planOptions) && data.planOptions.length > 0) {
        setPlanOptions(data.planOptions);
      }
    } catch { /* prefill 失敗不影響主流程 */ }
    finally { setPrefilling(false); }
  };

  const addFiles = (incoming: FileList | File[]) => {
    const allowed = Array.from(incoming).filter(
      f => f.type.startsWith("image/") || f.type === "application/pdf"
    );
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const deduped = allowed.filter(f => !existing.has(f.name + f.size));
      if (deduped.length > 0) triggerPrefill(deduped);
      return [...prev, ...deduped];
    });
    setResult(null);
    setError("");
    setFromCache(false);
    setProductId(null);
    setCorrectionSaved(false);
    setPlanOptions([]);
    setVerification(null);
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleAnalyze = async (force = false) => {
    if (files.length === 0 || !amount) return;
    setLoading(true);
    setVerifying(false);
    setVerification(null);
    setError("");
    setCorrectionSaved(false);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      fd.append("amount", amount);
      if (planType) fd.append("planType", planType);
      if (planCode) fd.append("planCode", planCode);
      if (year) fd.append("year", year);
      if (force) fd.append("force", "true");
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.data);
      setSavedAs(json.savedAs ?? []);
      setFromCache(false);
      setProductId(json.productId ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!result || files.length === 0) return;
    setVerifying(true);
    setVerification(null);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      fd.append("analysisJson", JSON.stringify(result));
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const json = await res.json();
      if (json.verification) setVerification(json.verification);
    } catch (e) {
      console.error("Verify failed:", e);
    } finally {
      setVerifying(false);
    }
  };

  const handleCorrection = async () => {
    if (!productId || !correctionField || !correctionValue) return;
    const res = await fetch("/api/correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        fieldPath: correctionField,
        newValue: correctionValue,
        note: correctionNote || undefined,
      }),
    });
    if (res.ok) {
      setCorrectionSaved(true);
      setCorrecting(false);
      setCorrectionField(""); setCorrectionValue(""); setCorrectionNote("");
    }
  };

  const canAnalyze = files.length > 0 && !!amount && !loading;

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          保單分析
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">上傳保單條款，AI 自動解析填入全險圖</p>
      </div>

      <div className="w-full px-8 py-6 space-y-5 overflow-auto flex-1">
        <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
          <CardHeader className="pb-3 pt-5 px-6">
            <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#C8956C]" />
              上傳保單條款
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-4">
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragOver ? "border-[#C8956C] bg-[#FEF9F2]" : "border-[#E8D5B7] hover:border-[#C8956C] hover:bg-[#FEF9F2]/60"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FBF0E3] flex items-center justify-center mx-auto mb-3">
                <Upload className="h-5 w-5 text-[#C8956C]" />
              </div>
              <p className="text-stone-600 font-medium text-sm">拖曳檔案到這裡，或點擊選擇</p>
              <p className="text-stone-400 text-xs mt-1">支援 PDF、JPG、PNG、WEBP · 可一次選取多張</p>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#FEF9F2] border border-[#EDE0CE] rounded-xl text-sm">
                    <FileIcon file={f} />
                    <span className="text-stone-700 flex-1 truncate">{f.name}</span>
                    <span className="text-stone-300 text-xs shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-stone-300 hover:text-red-400 transition-colors ml-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {files.length > 1 && (
                  <p className="text-xs text-stone-400 pl-1">共 {files.length} 個檔案，將合併分析</p>
                )}
              </div>
            )}

            {prefilling && (
              <p className="text-xs text-[#C8956C] flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                正在讀取條款資訊，自動填入欄位…
              </p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-stone-400 font-medium">
                  保額 / 方案<span className="text-red-400 ml-0.5">*</span>
                </label>
                {planOptions.length > 0 ? (
                  <select
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
                  >
                    <option value="">選擇計劃 / 保額</option>
                    {planOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <input
                      type="text"
                      placeholder="例：1000000 或 100萬"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      onBlur={e => formatAmountOnBlur(e.target.value)}
                      className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
                    />
                    <span className="text-[10px] text-stone-300 pl-1">輸入數字（如 1000000）自動換算為 100萬</span>
                  </div>
                )}
              </div>
              <FieldInput label="型別（甲/乙/丙）" value={planType} onChange={setPlanType} placeholder="選填" />
              <FieldInput label="計劃別" value={planCode} onChange={setPlanCode} placeholder="例：QDHL2" />
              <FieldInput label="條款年份（民國）" value={year} onChange={setYear} placeholder="例：108" />
            </div>

            <button
              onClick={() => handleAnalyze(true)}
              disabled={!canAnalyze}
              className="w-full py-3 rounded-2xl font-semibold text-sm transition-all text-white flex items-center justify-center gap-2 shadow-sm"
              style={
                !canAnalyze
                  ? { background: "#E8D5B7", color: "#B8A090", cursor: "not-allowed" }
                  : { background: "linear-gradient(135deg, #C8956C, #A0714F)" }
              }
              onMouseEnter={(e) => {
                if (canAnalyze) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #B07850, #8B5E3C)";
              }}
              onMouseLeave={(e) => {
                if (canAnalyze) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #C8956C, #A0714F)";
              }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />AI 解析中，請稍候…</>
                : files.length > 1
                  ? `🔍 分析 ${files.length} 個檔案，填入全險圖`
                  : "🔍 開始分析，填入全險圖"
              }
            </button>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">{error}</p>
            )}
            {savedAs.length > 0 && (
              <p className="text-emerald-600 text-xs flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-xl">
                <CheckCircle className="h-3.5 w-3.5" />
                已儲存 {savedAs.length} 個檔案
              </p>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            {fromCache && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-700">
                <Zap className="h-4 w-4" />
                從資料庫快取取得，已套用所有修正記錄
              </div>
            )}

            {verification && <VerificationPanel v={verification} />}

            <Tabs defaultValue="chart" className="w-full">
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
                  {files.length > 0 && (
                    <button
                      onClick={handleVerify}
                      disabled={verifying || loading}
                      className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-violet-600 transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white disabled:opacity-50"
                    >
                      {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "🔍"}
                      {verifying ? "稽核中…" : "稽核分析"}
                    </button>
                  )}
                  {files.length > 0 && (
                    <button
                      onClick={() => handleAnalyze(true)}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sky-600 transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "🔄"}
                      重新分析
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
                        <CheckCircle className="h-3 w-3" />
                        修正已儲存，下次同商品自動套用
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <TabsContent value="chart">
                <InsuranceChart data={result} />
              </TabsContent>
              <TabsContent value="raw">
                <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
                  <CardContent className="pt-4 px-5">
                    <pre className="text-xs text-stone-500 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
}
