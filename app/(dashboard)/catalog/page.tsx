"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Database, SlidersHorizontal, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductItem {
  id: string | number;
  company: string;
  product_name: string;
  plan_code: string;
  plan_type: string | null;
  year: string | null;
  category: string | null;
  verified: number;
  coverage_template: string;
  latest_analysis: string | null;
  // 河馬風格欄位
  sale_date?: string | null;
  stop_date?: string | null;
  status?: string | null;
  currency?: string | null;
  analyzed?: boolean;
  insuranceType?: string[];   // 險種（審核 analysis_json.insuranceType）
  displayCode?: string | null; // 商品代號（顧問填）
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

// 西元 ISO 日期（YYYY-MM-DD）→ 民國 yyy/mm/dd
function rocDate(iso?: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${parseInt(m[1], 10) - 1911}/${m[2]}/${m[3]}`;
}

// 銷售期間顯示：有停售日→區間；否則→「起」（現售）
function saleRange(saleDate?: string | null, stopDate?: string | null): string {
  const sale = rocDate(saleDate);
  const stop = rocDate(stopDate);
  if (stop) return `民國 ${sale || "—"} ～ ${stop}`;
  return sale ? `民國 ${sale} 起` : "—";
}

const planTypeLabel: Record<string, string> = {
  "主約": "主約", "附約": "附約", "批註條款": "批註",
};

const planTypeColor: Record<string, string> = {
  "主約": "bg-[#FBF0E3] text-[#8B5E3C]",
  "附約": "bg-sky-50 text-sky-700",
  "批註條款": "bg-stone-100 text-stone-400",
};

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
  const router = useRouter();

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
    setFilterActiveOnly(false);
    setProducts([]); setSearched(false);
  };

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          商品查詢
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">搜尋 Google Drive 已審核商品（{3705} 筆南山人壽）</p>
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
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">商品名稱 / 代號</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">銷售期間</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">狀態</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">契約類型</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">商品類型</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">險種</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">幣別</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-stone-500">審核</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p, i) => {
                        const onSale = p.status ? p.status !== "停售" : false;
                        return (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/product/${encodeURIComponent(p.plan_code)}`)}
                          className={`border-b border-[#F5EDE0] transition-colors cursor-pointer hover:bg-[#FEF9F2] ${i % 2 === 0 ? "bg-white" : "bg-[#FEFCF9]"}`}
                        >
                          <td className="px-6 py-3.5 text-stone-600 whitespace-nowrap">{p.company}</td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-stone-800">{p.product_name}</div>
                            {p.displayCode ? (
                              <div className="text-xs mt-0.5 font-mono">
                                <span className="text-[#8B5E3C]">代號 {p.displayCode}</span>
                                <span className="text-stone-300 ml-1">系統碼 {p.plan_code}</span>
                              </div>
                            ) : p.plan_code && p.plan_code !== "未知" && (
                              <div className="text-xs text-stone-400 mt-0.5 font-mono">{p.plan_code}</div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-stone-500 whitespace-nowrap text-xs">
                            {saleRange(p.sale_date, p.stop_date)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {p.status ? (
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${onSale ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
                                {p.status}
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
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {p.category ? (
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoryColor[p.category] ?? "bg-[#FBF0E3] text-[#8B5E3C]"}`}>
                                {categoryLabel[p.category] ?? p.category}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            {p.insuranceType && p.insuranceType.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[12rem]">
                                {p.insuranceType.map((t, ti) => (
                                  <span key={ti} className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-700 whitespace-nowrap">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3.5 text-stone-500 whitespace-nowrap text-xs">
                            {p.currency || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {p.analyzed ? (
                              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                已審核
                              </span>
                            ) : (
                              <span className="text-xs text-stone-300">未審核</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
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
            <p className="text-xs text-stone-300 mt-1">僅顯示已審核完成的商品</p>
          </div>
        )}
      </div>
    </>
  );
}
