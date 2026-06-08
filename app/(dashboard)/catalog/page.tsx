"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, FileText, Database, SlidersHorizontal, Search, ExternalLink, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const categoryLabel: Record<string, string> = {
  "傳統型壽險": "壽險", "投資型壽險": "投資壽險",
  "傳統型年金": "年金", "投資型年金": "投資年金",
  "健康保險": "健康", "傷害保險": "傷害",
  "定額醫療": "定額醫療", "醫療實支": "醫療實支",
  "防癌險": "防癌", "重大傷病": "重大傷病",
  "長照": "長照", "失能": "失能", "意外險": "意外",
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

function ProductDrawer({ product, onClose }: { product: ProductItem; onClose: () => void }) {
  const router = useRouter();
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
    if (!isCatalog || !product.plan_code) { setPdfStatus("error"); return; }
    setPdfStatus("loading");
    setPdfBlobUrl(null);
    let revoke = "";
    fetch(`/api/pdf-proxy?planCode=${encodeURIComponent(product.plan_code)}`)
      .then(res => {
        if (res.ok && (res.headers.get("content-type") ?? "").includes("pdf")) return res.blob();
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

  const handleViewAnalysis = () => {
    try {
      const data = JSON.parse(product.latest_analysis ?? product.coverage_template);
      sessionStorage.setItem("analyze_prefill", JSON.stringify({ data, pid: product.id }));
      router.push("/analyze");
    } catch { /* */ }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ pointerEvents: "all" }}>
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[680px] max-w-[90vw] bg-white shadow-2xl flex flex-col h-full border-l border-[#EDE0CE]">
        <div className="px-5 py-4 border-b border-[#EDE0CE] bg-[#FEF9F2] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-stone-800 text-base leading-tight truncate">{product.product_name}</h3>
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
                {saleDate && <span className="text-xs text-stone-400">開始：{saleDate}</span>}
                {stopDate && <span className="text-xs text-stone-400">停售：{stopDate}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasAnalysis && (
                <button
                  onClick={handleViewAnalysis}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#FBF0E3] text-[#8B5E3C] hover:bg-[#F0D9BC] transition-colors font-medium"
                >
                  查看全險圖
                </button>
              )}
              {isCatalog && (
                <a
                  href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${product.plan_code}`}
                  target="_blank" rel="noreferrer"
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors font-medium flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  保發中心
                </a>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

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
                target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
              >
                <ExternalLink className="h-4 w-4" />
                前往保發中心查看
              </a>
            </div>
          )}
          {pdfStatus === "ok" && pdfBlobUrl && (
            <iframe src={pdfBlobUrl} className="w-full h-full border-0" title="保單條款" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
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
    setFilterCompany(""); setFilterKeyword(""); setFilterCategory("");
    setProducts([]); setSearched(false);
  };

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          商品查詢
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">搜尋資料庫中已分析的保險商品</p>
      </div>

      <div className="w-full px-8 py-6 space-y-5 overflow-auto flex-1">
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

        {searched && (
          <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
            <CardHeader className="pb-0 pt-5 px-6">
              <CardTitle className="text-sm font-semibold text-stone-700">
                查詢結果
                {!loading && <span className="ml-2 text-xs font-normal text-stone-400">共 {products.length} 筆</span>}
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
                              let t: Record<string, unknown> = {};
                              try { t = JSON.parse(p.coverage_template); } catch { /* */ }
                              if (t._source === "tii_catalog" && !p.latest_analysis) {
                                return (
                                  <a
                                    href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${p.plan_code}`}
                                    target="_blank" rel="noreferrer"
                                    className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-400 hover:bg-stone-200 transition-colors font-medium"
                                  >
                                    保發中心 ↗
                                  </a>
                                );
                              }
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedProduct(p);
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
      </div>

      {selectedProduct && (
        <ProductDrawer
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}
