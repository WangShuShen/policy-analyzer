"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, ImageIcon, Loader2, CheckCircle, Zap, History, PenLine, X, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InsuranceChart from "@/components/InsuranceChart";

interface HistoryItem {
  id: number;
  product_id: number;
  insured_amount: string;
  created_at: string;
  company: string;
  product_name: string;
  plan_code: string;
  analysis_json: string;
}

function toRocDate(isoStr: string) {
  const [y, m, d] = isoStr.slice(0, 10).split("-");
  return `民國${parseInt(y) - 1911}年${m}月${d}日`;
}

function FieldInput({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-stone-500">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
      />
    </div>
  );
}

function FileIcon({ file }: { file: File }) {
  return file.type.startsWith("image/")
    ? <ImageIcon className="h-4 w-4 text-sky-600 shrink-0" />
    : <FileText className="h-4 w-4 text-rose-500 shrink-0" />;
}

export default function Home() {
  const router = useRouter();
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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionField, setCorrectionField] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showHistory) {
      fetch("/api/history").then(r => r.json()).then(d => setHistory(d.analyses ?? []));
    }
  }, [showHistory]);

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
      if (data.version && !year) {} // version 暫存於 planCode 旁，待 analyze 時傳入
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
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleAnalyze = async (force = false) => {
    if (files.length === 0 || !amount) return;
    setLoading(true);
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
      setCorrectionField("");
      setCorrectionValue("");
      setCorrectionNote("");
    }
  };

  const canAnalyze = files.length > 0 && !!amount && !loading;

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.985 0.012 80)" }}>
      <header className="bg-white border-b border-amber-100 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🗂️</div>
            <div>
              <h1 className="text-lg font-bold text-stone-800">保單分析系統</h1>
              <p className="text-xs text-stone-500">上傳條款 → 自動填入全險圖</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-amber-700 transition-colors"
            >
              <History className="h-4 w-4" />
              歷史紀錄
            </button>
            <button
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                router.push("/login");
              }}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-red-500 transition-colors"
              title="登出"
            >
              <LogOut className="h-4 w-4" />
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* 歷史紀錄 */}
        {showHistory && (
          <Card className="bg-white border-amber-100 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-stone-700">📜 最近分析紀錄</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {history.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-4">尚無紀錄</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors"
                      onClick={() => {
                        setResult(JSON.parse(h.analysis_json));
                        setProductId(h.product_id);
                        setShowHistory(false);
                      }}
                    >
                      <div>
                        <p className="text-sm font-medium text-stone-800">{h.company} · {h.product_name}</p>
                        <p className="text-xs text-stone-500">{h.plan_code} · 保額 {h.insured_amount}</p>
                      </div>
                      <p className="text-xs text-stone-400">{toRocDate(h.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 上傳區 */}
        <Card className="bg-white border-amber-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-stone-800 text-base">📤 上傳保單條款</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 拖放區 */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-amber-500 bg-amber-50" : "border-amber-200 hover:border-amber-400 hover:bg-amber-50/40"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-9 w-9 mx-auto mb-2 text-amber-300" />
              <p className="text-stone-600 font-medium">拖曳檔案到這裡，或點擊選擇</p>
              <p className="text-stone-400 text-sm mt-1">可一次選取多張圖片 · 支援 PDF、JPG、PNG、WEBP</p>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* 已選檔案清單 */}
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                    <FileIcon file={f} />
                    <span className="text-stone-700 flex-1 truncate">{f.name}</span>
                    <span className="text-stone-400 text-xs shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-stone-400 hover:text-red-500 transition-colors ml-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {files.length > 1 && (
                  <p className="text-xs text-stone-400 pl-1">共 {files.length} 個檔案，將合併送出分析</p>
                )}
              </div>
            )}

            {/* 欄位輸入 */}
            {prefilling && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> 讀取條款資訊中…
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-stone-500">
                  保額 / 方案<span className="text-red-500 ml-0.5">*</span>
                </label>
                {planOptions.length > 0 ? (
                  <select
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                  >
                    <option value="">選擇計劃 / 保額</option>
                    {planOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="例：1000、30萬"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                  />
                )}
              </div>
              <FieldInput label="型別（甲/乙/丙）" value={planType} onChange={setPlanType}
                placeholder="選填" />
              <FieldInput label="計劃別" value={planCode} onChange={setPlanCode}
                placeholder="例：QDHL2" />
              <FieldInput label="條款年份（民國）" value={year} onChange={setYear}
                placeholder="例：108" />
            </div>

            <button
              onClick={() => handleAnalyze()}
              disabled={!canAnalyze}
              className="w-full py-3 rounded-xl font-medium text-sm transition-all text-white flex items-center justify-center gap-2"
              style={
                !canAnalyze
                  ? { background: "oklch(0.88 0.02 80)", color: "oklch(0.6 0.02 60)", cursor: "not-allowed" }
                  : { background: "oklch(0.58 0.13 55)" }
              }
              onMouseEnter={(e) => {
                if (canAnalyze) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.52 0.13 55)";
              }}
              onMouseLeave={(e) => {
                if (canAnalyze) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.58 0.13 55)";
              }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />AI 解析中…</>
                : files.length > 1
                  ? `🔍 分析 ${files.length} 個檔案，填入全險圖`
                  : "🔍 開始分析，填入全險圖"
              }
            </button>

            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}
            {savedAs.length > 0 && (
              <p className="text-emerald-700 text-xs flex items-center gap-1 bg-emerald-50 px-3 py-2 rounded-lg">
                <CheckCircle className="h-3 w-3" />
                已儲存 {savedAs.length} 個檔案至 contracts/公司/年份/版次/
              </p>
            )}
          </CardContent>
        </Card>

        {/* 分析結果 */}
        {result && (
          <>
            {fromCache && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
                <Zap className="h-4 w-4" />
                從資料庫快取取得，已套用所有修正記錄
              </div>
            )}

            <Tabs defaultValue="chart" className="w-full">
              <div className="flex items-center justify-between mb-2">
                <TabsList className="bg-white border border-amber-100 shadow-sm">
                  <TabsTrigger value="chart"
                    className="data-[state=active]:bg-amber-100 data-[state=active]:text-stone-800 text-stone-500">
                    📊 全險圖
                  </TabsTrigger>
                  <TabsTrigger value="raw"
                    className="data-[state=active]:bg-amber-100 data-[state=active]:text-stone-800 text-stone-500">
                    🔍 原始資料
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  {files.length > 0 && (
                    <button
                      onClick={() => handleAnalyze(true)}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-sky-700 transition-colors border border-stone-200 rounded-lg px-3 py-1.5 bg-white disabled:opacity-50"
                      title="繞過快取，用最新規則重新分析並更新資料庫"
                    >
                      <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : "hidden"}`} />
                      {!loading && "🔄"} 重新分析
                    </button>
                  )}
                  {productId && (
                    <button
                      onClick={() => setCorrecting(!correcting)}
                      className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-amber-700 transition-colors border border-stone-200 rounded-lg px-3 py-1.5 bg-white"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      修正欄位
                    </button>
                  )}
                </div>
              </div>

              {/* 修正面板 */}
              {correcting && productId && (
                <Card className="bg-amber-50 border-amber-200 shadow-sm mb-4">
                  <CardContent className="px-4 py-4 space-y-3">
                    <p className="text-xs font-medium text-stone-600">修正後會儲存到資料庫，下次同商品自動套用</p>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      <FieldInput label="欄位路徑" value={correctionField} onChange={setCorrectionField}
                        placeholder="例：fixedMedical.icu" />
                      <FieldInput label="正確值" value={correctionValue} onChange={setCorrectionValue}
                        placeholder="例：2,000元/日（限180日）" />
                      <FieldInput label="備注（選填）" value={correctionNote} onChange={setCorrectionNote}
                        placeholder="例：日額×2，非×1" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCorrection}
                        disabled={!correctionField || !correctionValue}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: "oklch(0.58 0.13 55)" }}
                      >
                        儲存修正
                      </button>
                      <button
                        onClick={() => setCorrecting(false)}
                        className="px-4 py-2 rounded-lg text-sm text-stone-500 border border-stone-200 bg-white"
                      >
                        取消
                      </button>
                    </div>
                    {correctionSaved && (
                      <p className="text-emerald-700 text-xs flex items-center gap-1">
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
                <Card className="bg-white border-amber-100 shadow-sm">
                  <CardContent className="pt-4">
                    <pre className="text-xs text-stone-600 overflow-auto max-h-96 whitespace-pre-wrap font-mono">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
