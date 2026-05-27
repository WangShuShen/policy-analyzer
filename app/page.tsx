"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, ImageIcon, Loader2, CheckCircle,
  Zap, PenLine, X, LogOut, LayoutDashboard, ClockIcon,
  ChevronRight,
} from "lucide-react";
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

function FileIcon({ file }: { file: File }) {
  return file.type.startsWith("image/")
    ? <ImageIcon className="h-4 w-4 text-sky-500 shrink-0" />
    : <FileText className="h-4 w-4 text-rose-400 shrink-0" />;
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
  activeView,
  onNavigate,
  onLogout,
}: {
  activeView: string;
  onNavigate: (v: string) => void;
  onLogout: () => void;
}) {
  const navItems = [
    { id: "analyze", icon: <LayoutDashboard className="h-4 w-4" />, label: "保單分析" },
    { id: "history", icon: <ClockIcon className="h-4 w-4" />, label: "歷史紀錄" },
  ];

  return (
    <aside className="w-56 bg-white border-r border-[#EDE0CE] flex flex-col shrink-0 shadow-sm">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#EDE0CE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden bg-amber-50 flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand-icon.png"
              alt="傳家知保"
              className="w-10 h-10 object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                (e.currentTarget.nextElementSibling as HTMLElement).style.display = "flex";
              }}
            />
            <span className="text-xl hidden items-center justify-center">🏠</span>
          </div>
          <div>
            <div
              className="text-base font-bold text-stone-800 leading-tight"
              style={{ fontFamily: "var(--font-serif-tc), serif" }}
            >
              傳家知保
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">保單分析工具</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider px-3 pt-2 pb-1">功能選單</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 group ${
              activeView === item.id
                ? "bg-[#FBF0E3] text-[#8B5E3C] font-semibold"
                : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
            }`}
          >
            <span className={activeView === item.id ? "text-[#C8956C]" : "text-stone-400 group-hover:text-stone-500"}>
              {item.icon}
            </span>
            {item.label}
            {activeView === item.id && (
              <ChevronRight className="h-3 w-3 ml-auto text-[#C8956C]" />
            )}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[#EDE0CE]">
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2.5 rounded-xl text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center gap-2 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          登出系統
        </button>
      </div>
    </aside>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<"analyze" | "history">("analyze");

  // Analysis state
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
  const [correcting, setCorrecting] = useState(false);
  const [correctionField, setCorrectionField] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (activeView === "history") {
      setHistoryLoading(true);
      fetch("/api/history")
        .then(r => r.json())
        .then(d => setHistory(d.analyses ?? []))
        .finally(() => setHistoryLoading(false));
    }
  }, [activeView]);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

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
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.985 0.012 75)" }}>

      {/* ── Sidebar ── */}
      <Sidebar
        activeView={activeView}
        onNavigate={(v) => setActiveView(v as "analyze" | "history")}
        onLogout={handleLogout}
      />

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto">

        {/* Page Header */}
        <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm">
          <div className="max-w-4xl">
            {activeView === "analyze" ? (
              <>
                <h2
                  className="text-lg font-bold text-stone-800"
                  style={{ fontFamily: "var(--font-serif-tc), serif" }}
                >
                  保單分析
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">上傳保單條款，AI 自動解析填入全險圖</p>
              </>
            ) : (
              <>
                <h2
                  className="text-lg font-bold text-stone-800"
                  style={{ fontFamily: "var(--font-serif-tc), serif" }}
                >
                  歷史紀錄
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">過去的分析結果，點擊可重新查看</p>
              </>
            )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

          {/* ── 保單分析 View ── */}
          {activeView === "analyze" && (
            <>
              {/* 上傳卡片 */}
              <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                    <Upload className="h-4 w-4 text-[#C8956C]" />
                    上傳保單條款
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  {/* 拖放區 */}
                  <div
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      dragOver
                        ? "border-[#C8956C] bg-[#FEF9F2]"
                        : "border-[#E8D5B7] hover:border-[#C8956C] hover:bg-[#FEF9F2]/60"
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

                  {/* 已選檔案 */}
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

                  {/* Prefill loading */}
                  {prefilling && (
                    <p className="text-xs text-[#C8956C] flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      正在讀取條款資訊，自動填入欄位…
                    </p>
                  )}

                  {/* 欄位輸入 */}
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
                          className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
                        />
                      )}
                    </div>
                    <FieldInput label="型別（甲/乙/丙）" value={planType} onChange={setPlanType} placeholder="選填" />
                    <FieldInput label="計劃別" value={planCode} onChange={setPlanCode} placeholder="例：QDHL2" />
                    <FieldInput label="條款年份（民國）" value={year} onChange={setYear} placeholder="例：108" />
                  </div>

                  {/* 分析按鈕 */}
                  <button
                    onClick={() => handleAnalyze()}
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
                    <p className="text-red-500 text-sm bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">
                      {error}
                    </p>
                  )}
                  {savedAs.length > 0 && (
                    <p className="text-emerald-600 text-xs flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-xl">
                      <CheckCircle className="h-3.5 w-3.5" />
                      已儲存 {savedAs.length} 個檔案
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 分析結果 */}
              {result && (
                <>
                  {fromCache && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-sm text-emerald-700">
                      <Zap className="h-4 w-4" />
                      從資料庫快取取得，已套用所有修正記錄
                    </div>
                  )}

                  <Tabs defaultValue="chart" className="w-full">
                    <div className="flex items-center justify-between mb-3">
                      <TabsList className="bg-white border border-[#EDE0CE] shadow-sm rounded-xl">
                        <TabsTrigger
                          value="chart"
                          className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm"
                        >
                          📊 全險圖
                        </TabsTrigger>
                        <TabsTrigger
                          value="raw"
                          className="rounded-lg data-[state=active]:bg-[#FBF0E3] data-[state=active]:text-[#8B5E3C] text-stone-400 text-sm"
                        >
                          🔍 原始資料
                        </TabsTrigger>
                      </TabsList>

                      <div className="flex items-center gap-2">
                        {files.length > 0 && (
                          <button
                            onClick={() => handleAnalyze(true)}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sky-600 transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white disabled:opacity-50"
                          >
                            {loading
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : "🔄"
                            }
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

                    {/* 修正面板 */}
                    {correcting && productId && (
                      <Card className="bg-[#FEF9F2] border-[#E8D5B7] shadow-sm rounded-2xl mb-4">
                        <CardContent className="px-5 py-4 space-y-3">
                          <p className="text-xs text-stone-500">修正後會儲存到資料庫，下次同商品自動套用</p>
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
            </>
          )}

          {/* ── 歷史紀錄 View ── */}
          {activeView === "history" && (
            <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
              <CardContent className="px-6 py-5">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-stone-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">載入中…</span>
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12">
                    <ClockIcon className="h-10 w-10 text-stone-200 mx-auto mb-3" />
                    <p className="text-sm text-stone-400">尚無分析紀錄</p>
                    <button
                      onClick={() => setActiveView("analyze")}
                      className="mt-3 text-xs text-[#C8956C] hover:underline"
                    >
                      去分析第一份保單 →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-4 py-3 bg-[#FEF9F2] border border-[#EDE0CE] rounded-xl cursor-pointer hover:bg-[#FBF0E3] hover:border-[#D4A882] transition-all group"
                        onClick={() => {
                          setResult(JSON.parse(h.analysis_json));
                          setProductId(h.product_id);
                          setActiveView("analyze");
                        }}
                      >
                        <div>
                          <p className="text-sm font-semibold text-stone-800">{h.company} · {h.product_name}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{h.plan_code} · 保額 {h.insured_amount}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-xs text-stone-400">{toRocDate(h.created_at)}</p>
                          <ChevronRight className="h-4 w-4 text-stone-300 group-hover:text-[#C8956C] transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </main>
    </div>
  );
}
