"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, ImageIcon, Loader2, CheckCircle,
  Zap, PenLine, X, LogOut, LayoutDashboard, ClockIcon,
  ChevronRight, Search, Database, SlidersHorizontal, ExternalLink,
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
                    <code className="text-xs text-stone-500 bg-stone-50 px-1.5 py-0.5 rounded font-mono">
                      {f.field}
                    </code>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-stone-400">{f.issueType}</span>
                    </div>
                  </div>
                  <p className="text-sm text-stone-700 leading-snug">{f.detail}</p>
                  {f.currentValue && (
                    <p className="text-xs text-stone-400">目前值：<span className="font-mono">{f.currentValue}</span></p>
                  )}
                  {f.suggestedValue && (
                    <p className="text-xs text-emerald-600">建議值：<span className="font-mono font-semibold">{f.suggestedValue}</span></p>
                  )}
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
  const [iconError, setIconError] = useState(false);
  const navItems = [
    { id: "analyze", icon: <LayoutDashboard className="h-4 w-4" />, label: "保單分析" },
    { id: "catalog", icon: <Database className="h-4 w-4" />, label: "商品查詢" },
    { id: "history", icon: <ClockIcon className="h-4 w-4" />, label: "歷史紀錄" },
  ];

  return (
    <aside className="w-56 bg-white border-r border-[#EDE0CE] flex flex-col shrink-0 shadow-sm">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#EDE0CE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden bg-amber-50 flex items-center justify-center shrink-0">
            {iconError ? (
              <span className="text-xl">🏠</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/brand-icon.png"
                alt="傳家知保"
                className="w-10 h-10 object-cover"
                onError={() => setIconError(true)}
              />
            )}
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

// ── Product Drawer ─────────────────────────────────────────────────────────

function ProductDrawer({
  product,
  onClose,
  onViewAnalysis,
  categoryColor,
  categoryLabel,
  planTypeColor,
  planTypeLabel,
}: {
  product: ProductItem;
  onClose: () => void;
  onViewAnalysis?: (data: Record<string, unknown>, id: number) => void;
  categoryColor: Record<string, string>;
  categoryLabel: Record<string, string>;
  planTypeColor: Record<string, string>;
  planTypeLabel: Record<string, string>;
}) {
  const [pdfStatus, setPdfStatus] = useState<"loading" | "ok" | "error">("loading");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  let tmpl: Record<string, unknown> = {};
  try { tmpl = JSON.parse(product.coverage_template); } catch { /* */ }
  const isCatalog = tmpl._source === "tii_catalog";
  const isActive = tmpl._active === true;
  const saleDate = tmpl._saleDate as string | undefined;
  const stopDate = tmpl._stopDate as string | undefined;
  const hasAnalysis = !!product.latest_analysis;

  useEffect(() => {
    if (!isCatalog || !product.plan_code) {
      setPdfStatus("error");
      return;
    }
    setPdfStatus("loading");
    setPdfBlobUrl(null);
    let revoke = "";
    fetch(`/api/pdf-proxy?planCode=${encodeURIComponent(product.plan_code)}`)
      .then(res => {
        if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) {
          return res.blob();
        }
        throw new Error("not-pdf");
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setPdfBlobUrl(url);
        setPdfStatus("ok");
      })
      .catch(() => setPdfStatus("error"));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [product.plan_code, isCatalog]);

  return (
    <div className="fixed inset-0 z-50 flex" style={{ pointerEvents: "all" }}>
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="w-[680px] max-w-[90vw] bg-white shadow-2xl flex flex-col h-full border-l border-[#EDE0CE]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EDE0CE] bg-[#FEF9F2] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-stone-800 text-base leading-tight truncate">
                {product.product_name}
              </h3>
              <p className="text-sm text-stone-500 mt-0.5">
                {product.company}
                {product.plan_code && product.plan_code !== "未知" && (
                  <span className="ml-2 font-mono text-xs text-stone-400">{product.plan_code}</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {product.category && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoryColor[product.category] ?? "bg-stone-100 text-stone-500"}`}>
                    {categoryLabel[product.category] ?? product.category}
                  </span>
                )}
                {product.plan_type && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${planTypeColor[product.plan_type] ?? "bg-stone-100 text-stone-500"}`}>
                    {planTypeLabel[product.plan_type] ?? product.plan_type}
                  </span>
                )}
                {isCatalog && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
                    {isActive ? "在售" : "停售"}
                  </span>
                )}
                {saleDate && (
                  <span className="text-xs text-stone-400">開始：{saleDate}</span>
                )}
                {stopDate && (
                  <span className="text-xs text-stone-400">停售：{stopDate}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasAnalysis && onViewAnalysis && (
                <button
                  onClick={() => {
                    try {
                      const data = JSON.parse(product.latest_analysis ?? product.coverage_template);
                      onViewAnalysis(data, product.id);
                    } catch { /* */ }
                    onClose();
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#FBF0E3] text-[#8B5E3C] hover:bg-[#F0D9BC] transition-colors font-medium"
                >
                  查看全險圖
                </button>
              )}
              {isCatalog && (
                <a
                  href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${product.plan_code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors font-medium flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  保發中心
                </a>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>

        {/* PDF Viewer Area */}
        <div className="flex-1 relative bg-stone-100 overflow-hidden">
          {pdfStatus === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">連線保發中心取得條款…</p>
            </div>
          )}
          {pdfStatus === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-stone-400 px-10">
              <div className="w-16 h-16 rounded-2xl bg-stone-200 flex items-center justify-center">
                <FileText className="h-8 w-8 text-stone-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-stone-600 mb-1">條款 PDF 尚未建立</p>
                <p className="text-xs text-stone-400 leading-relaxed">
                  保發中心需要登入才能取得 PDF。<br />
                  可點擊右上方「保發中心」連結，<br />
                  或上傳條款後使用 AI 分析功能。
                </p>
              </div>
              <a
                href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${product.plan_code}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
              >
                <ExternalLink className="h-4 w-4" />
                前往保發中心查看
              </a>
            </div>
          )}
          {pdfStatus === "ok" && pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              className="w-full h-full border-0"
              title="保單條款"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Catalog View ───────────────────────────────────────────────────────

interface ProductItem {
  id: number;
  company: string;
  product_name: string;
  plan_code: string;
  plan_type: string | null;
  year: string | null;
  category: string | null;
  verified: number;
  coverage_template: string;
  latest_analysis: string | null;
}

function CatalogView({ onViewAnalysis }: { onViewAnalysis: (data: Record<string, unknown>, productId: number) => void }) {
  const [companies, setCompanies] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filterCompany, setFilterCompany] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  useEffect(() => {
    fetch("/api/products?action=meta")
      .then(r => r.json())
      .then(d => {
        setCompanies(d.companies ?? []);
        setCategories(d.categories ?? []);
      });
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (filterCompany) params.set("company", filterCompany);
      if (filterKeyword) params.set("keyword", filterKeyword);
      if (filterCategory) params.set("category", filterCategory);
      if (filterActiveOnly) params.set("activeOnly", "1");
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.products ?? []);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterCompany("");
    setFilterKeyword("");
    setFilterCategory("");
    setProducts([]);
    setSearched(false);
  };

  const categoryLabel: Record<string, string> = {
    "傳統型壽險": "壽險", "投資型壽險": "投資壽險",
    "傳統型年金": "年金", "投資型年金": "投資年金",
    "健康保險": "健康", "傷害保險": "傷害",
    "定額醫療": "定額醫療", "醫療實支": "醫療實支",
    "防癌險": "防癌", "重大傷病": "重大傷病",
    "長照": "長照", "失能": "失能",
    "意外險": "意外",
  };

  const categoryColor: Record<string, string> = {
    "傳統型壽險": "bg-blue-50 text-blue-700",
    "投資型壽險": "bg-indigo-50 text-indigo-700",
    "傳統型年金": "bg-purple-50 text-purple-700",
    "投資型年金": "bg-violet-50 text-violet-700",
    "健康保險": "bg-green-50 text-green-700",
    "傷害保險": "bg-orange-50 text-orange-700",
    "定額醫療": "bg-teal-50 text-teal-700",
    "醫療實支": "bg-cyan-50 text-cyan-700",
    "防癌險": "bg-rose-50 text-rose-700",
    "重大傷病": "bg-red-50 text-red-700",
    "長照": "bg-amber-50 text-amber-700",
    "失能": "bg-yellow-50 text-yellow-700",
    "意外險": "bg-orange-50 text-orange-700",
  };

  const planTypeLabel: Record<string, string> = {
    "主約": "主約", "附約": "附約", "批註條款": "批註",
  };

  const planTypeColor: Record<string, string> = {
    "主約": "bg-[#FBF0E3] text-[#8B5E3C]",
    "附約": "bg-sky-50 text-sky-700",
    "批註條款": "bg-stone-100 text-stone-400",
  };

  return (
    <div className="space-y-5">
      {/* 搜尋條件 */}
      <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
        <CardHeader className="pb-3 pt-5 px-6">
          <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#C8956C]" />
            商品篩選條件
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">保險公司</label>
              <select
                value={filterCompany}
                onChange={e => setFilterCompany(e.target.value)}
                className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
              >
                <option value="">－ 全部 －</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">商品名稱 / 計劃代號</label>
              <input
                type="text"
                value={filterKeyword}
                onChange={e => setFilterKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="請輸入關鍵字"
                className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2.5 text-sm text-stone-700 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-400">險種類別</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2.5 text-sm text-stone-700 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
              >
                <option value="">－ 全部 －</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 shadow-sm"
              style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
            >
              <Search className="h-4 w-4" />
              {loading ? "查詢中…" : "查詢"}
            </button>
            <button
              onClick={handleClear}
              className="px-5 py-2.5 rounded-xl text-sm text-stone-500 border border-[#EDE0CE] bg-white hover:bg-stone-50 transition-all"
            >
              清除
            </button>
            <label className="flex items-center gap-2 cursor-pointer select-none ml-1">
              <div
                onClick={() => setFilterActiveOnly(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${filterActiveOnly ? "bg-emerald-500" : "bg-stone-200"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${filterActiveOnly ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-stone-500">只看在售</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* 查詢結果 */}
      {searched && (
        <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm font-semibold text-stone-700">
              查詢結果
              {!loading && (
                <span className="ml-2 text-xs font-normal text-stone-400">
                  共 {products.length} 筆
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-4">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-stone-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">查詢中…</span>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-10">
                <Database className="h-10 w-10 text-stone-200 mx-auto mb-3" />
                <p className="text-sm text-stone-400">查無資料</p>
                <p className="text-xs text-stone-300 mt-1">請先上傳並分析保單以建立資料庫</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EDE0CE] bg-[#FEF9F2]">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-stone-500">保險公司</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">商品名稱 / 計劃代號</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">年份</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">險種</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">型別</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-stone-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className={`border-b border-[#F5EDE0] transition-colors cursor-pointer ${
                          selectedProduct?.id === p.id
                            ? "bg-[#FBF0E3] border-l-2 border-l-[#C8956C]"
                            : `hover:bg-[#FEF9F2] ${i % 2 === 0 ? "bg-white" : "bg-[#FEFCF9]"}`
                        }`}
                      >
                        <td className="px-6 py-3.5 text-stone-600 whitespace-nowrap">{p.company}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-stone-800">{p.product_name}</div>
                          {p.plan_code && p.plan_code !== "未知" && (
                            <div className="text-xs text-stone-400 mt-0.5">{p.plan_code}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-stone-500 whitespace-nowrap">
                          {p.year ? `${p.year} 年` : "—"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {p.category ? (
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoryColor[p.category] ?? "bg-[#FBF0E3] text-[#8B5E3C]"}`}>
                              {categoryLabel[p.category] ?? p.category}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {p.plan_type ? (
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${planTypeColor[p.plan_type] ?? "bg-stone-100 text-stone-500"}`}>
                              {planTypeLabel[p.plan_type] ?? p.plan_type}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {(() => {
                            let tmpl: Record<string, unknown> = {};
                            try { tmpl = JSON.parse(p.coverage_template); } catch { /* */ }
                            const isCatalogOnly = tmpl._source === "tii_catalog" && !p.latest_analysis;
                            if (isCatalogOnly) {
                              return (
                                <a
                                  href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${p.plan_code}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-400 hover:bg-stone-200 transition-colors font-medium"
                                >
                                  保發中心 ↗
                                </a>
                              );
                            }
                            return (
                              <button
                                onClick={() => {
                                  try {
                                    const data = JSON.parse(p.latest_analysis ?? p.coverage_template);
                                    onViewAnalysis(data, p.id);
                                  } catch { /* ignore */ }
                                }}
                                className="text-xs px-3 py-1.5 rounded-lg bg-[#FBF0E3] text-[#8B5E3C] hover:bg-[#F0D9BC] transition-colors font-medium"
                              >
                                查看全險圖
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!searched && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-300">
          <Database className="h-14 w-14 mb-4" />
          <p className="text-sm font-medium text-stone-400">輸入條件後按「查詢」</p>
          <p className="text-xs text-stone-300 mt-1">可搜尋資料庫中的保險商品（含保發中心資料）</p>
        </div>
      )}

      {selectedProduct && (
        <ProductDrawer
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onViewAnalysis={(data, id) => {
            onViewAnalysis(data, id);
            setSelectedProduct(null);
          }}
          categoryColor={categoryColor}
          categoryLabel={categoryLabel}
          planTypeColor={planTypeColor}
          planTypeLabel={planTypeLabel}
        />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<"analyze" | "catalog" | "history">("analyze");

  // Analysis state
  const formatAmountOnBlur = (val: string) => {
    const stripped = val.replace(/[,，\s元]/g, "");
    if (/^\d+$/.test(stripped)) {
      const num = parseInt(stripped, 10);
      if (num >= 10000) {
        const wan = num / 10000;
        setAmount(Number.isInteger(wan) ? `${wan}萬` : `${wan}萬`);
        return;
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
            {{
              analyze: (
                <>
                  <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>保單分析</h2>
                  <p className="text-xs text-stone-400 mt-0.5">上傳保單條款，AI 自動解析填入全險圖</p>
                </>
              ),
              catalog: (
                <>
                  <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>商品查詢</h2>
                  <p className="text-xs text-stone-400 mt-0.5">搜尋資料庫中已分析的保險商品</p>
                </>
              ),
              history: (
                <>
                  <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>歷史紀錄</h2>
                  <p className="text-xs text-stone-400 mt-0.5">過去的分析結果，點擊可重新查看</p>
                </>
              ),
            }[activeView]}
          </div>
        </div>

        <div className="w-full px-8 py-6 space-y-5">

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

                  {/* 分析按鈕 */}
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

                  {verification && <VerificationPanel v={verification} />}

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
                            onClick={handleVerify}
                            disabled={verifying || loading}
                            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-violet-600 transition-colors border border-[#EDE0CE] rounded-xl px-3 py-1.5 bg-white disabled:opacity-50"
                          >
                            {verifying
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : "🔍"
                            }
                            {verifying ? "稽核中…" : "稽核分析"}
                          </button>
                        )}
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

          {/* ── 商品查詢 View ── */}
          {activeView === "catalog" && (
            <CatalogView
              onViewAnalysis={(data, productId) => {
                setResult(data);
                setProductId(productId);
                setActiveView("analyze");
              }}
            />
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
