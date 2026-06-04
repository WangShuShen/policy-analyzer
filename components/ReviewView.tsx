"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, CheckCircle, Loader2, ClipboardCheck,
  FileText, ExternalLink, Archive,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface ReviewProduct {
  id: string;          // planCode
  planCode: string;
  company: string;
  product_name: string;
  sheetUrl: string;
  pdfDriveId: string;
  filename: string;
  uploadedAt: string;
  category: string | null;
}

interface AnalysisItem {
  name: string;
  formula: string;
  unit?: string;
  restriction?: string;
  notes?: string;
}

interface AnalysisData {
  company?: string;
  productName?: string;
  planCode?: string;
  insuranceType?: string[];
  baseType?: string;
  items?: AnalysisItem[];
  annualLimit?: { formula?: string; notes?: string };
  waitingPeriod?: { disease?: number; injury?: number; note?: string };
  exclusions?: string[];
  specialRestrictions?: string[];
}

// ── Editable cell ──────────────────────────────────────────────────────

function EditableCell({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  return editing ? (
    <textarea
      autoFocus
      className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 bg-amber-50 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
      rows={2}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
    />
  ) : (
    <span
      className="block text-xs text-stone-700 cursor-pointer hover:bg-amber-50 rounded px-1 py-0.5 -mx-1 whitespace-pre-wrap transition-colors"
      onClick={() => { setDraft(value); setEditing(true); }}
      title="點擊編輯"
    >
      {value || <span className="text-stone-300 italic">—</span>}
    </span>
  );
}

// ── Items Editor ───────────────────────────────────────────────────────

function ItemsEditor({
  data,
  onDataChange,
}: {
  data: AnalysisData;
  onDataChange: (updated: AnalysisData) => void;
}) {
  const updateItem = (idx: number, field: keyof AnalysisItem, val: string) => {
    const items = [...(data.items ?? [])];
    items[idx] = { ...items[idx], [field]: val };
    onDataChange({ ...data, items });
  };

  const insuranceTypes = Array.isArray(data.insuranceType)
    ? data.insuranceType.join("、")
    : data.insuranceType ?? "";

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
        {[
          ["保險公司", data.company],
          ["保單名稱", data.productName],
          ["險種", insuranceTypes],
          ["給付基礎", data.baseType],
        ].filter(([, v]) => v).map(([label, val]) => (
          <div key={label as string} className="flex gap-3 text-sm">
            <span className="text-stone-400 w-20 shrink-0">{label as string}</span>
            <span className="text-stone-700 font-medium">{val as string}</span>
          </div>
        ))}
      </div>

      {/* Items table */}
      {data.items && data.items.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-stone-600">📋 給付項目</span>
            <span className="text-xs text-stone-400 ml-2">（點擊任一欄位可編輯）</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/50">
                  <th className="text-left px-3 py-2 text-stone-400 font-medium w-32">給付項目</th>
                  <th className="text-left px-3 py-2 text-stone-400 font-medium">計算公式</th>
                  <th className="text-left px-3 py-2 text-stone-400 font-medium w-16">單位</th>
                  <th className="text-left px-3 py-2 text-stone-400 font-medium">限制條件</th>
                  <th className="text-left px-3 py-2 text-stone-400 font-medium">備註</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors">
                    <td className="px-3 py-2 align-top">
                      <EditableCell value={item.name} onChange={v => updateItem(idx, "name", v)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EditableCell value={item.formula} onChange={v => updateItem(idx, "formula", v)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EditableCell value={item.unit ?? ""} onChange={v => updateItem(idx, "unit", v)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EditableCell value={item.restriction ?? ""} onChange={v => updateItem(idx, "restriction", v)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <EditableCell value={item.notes ?? ""} onChange={v => updateItem(idx, "notes", v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Annual limit */}
      {data.annualLimit?.formula && (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 mb-1">📊 年度給付上限</p>
          <p className="text-xs text-stone-700">{data.annualLimit.formula}</p>
          {data.annualLimit.notes && (
            <p className="text-xs text-stone-400 mt-1">{data.annualLimit.notes}</p>
          )}
        </div>
      )}

      {/* Waiting period */}
      {data.waitingPeriod?.note && (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 mb-1">⏳ 等待期</p>
          <p className="text-xs text-stone-700">{data.waitingPeriod.note}</p>
        </div>
      )}

      {/* Exclusions */}
      {data.exclusions && data.exclusions.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-yellow-700">⚠️ 除外責任</span>
          </div>
          <div className="px-4 py-2 space-y-1">
            {data.exclusions.map((e, i) => (
              <p key={i} className="text-xs text-red-600">❌ {e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Special restrictions */}
      {data.specialRestrictions && data.specialRestrictions.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-indigo-700">📌 特殊限制</span>
          </div>
          <div className="px-4 py-2 space-y-1">
            {data.specialRestrictions.map((r, i) => (
              <p key={i} className="text-xs text-indigo-700">• {r}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PDF panel ─────────────────────────────────────────────────────────

function PdfPanel({ pdfDriveId, planCode }: { pdfDriveId: string; planCode: string }) {
  if (!pdfDriveId) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-stone-400 px-8">
      <FileText className="h-12 w-12 text-stone-300" />
      <div className="text-center">
        <p className="text-sm font-medium text-stone-500">無 PDF 檔案 ID</p>
        <p className="text-xs text-stone-400 mt-1">可至保發中心直接查閱</p>
      </div>
      {planCode && planCode !== "未知" && (
        <a
          href={`https://insprod.tii.org.tw/DetailList.aspx?productId=${planCode}`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          前往保發中心
        </a>
      )}
    </div>
  );

  return (
    <iframe
      src={`https://drive.google.com/file/d/${pdfDriveId}/preview`}
      className="w-full h-full border-0"
      title="保單條款 PDF"
      allow="autoplay"
    />
  );
}

// ── ReviewDetail ───────────────────────────────────────────────────────

function ReviewDetail({
  product,
  onBack,
  onArchived,
}: {
  product: ReviewProduct;
  onBack: () => void;
  onArchived: () => void;
}) {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch(`/api/review/${product.planCode}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setAnalysisError(d.error);
        else setAnalysisData(d);
      })
      .catch(e => setAnalysisError(String(e)))
      .finally(() => setAnalysisLoading(false));
  }, [product.planCode]);

  const handleArchive = async () => {
    if (!confirm(`確認歸檔「${product.product_name}」？\n歸檔後將從待審核區移至正式資料庫。`)) return;
    setArchiving(true);
    setArchiveResult(null);
    try {
      const res = await fetch(`/api/review/${product.planCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: product.sheetUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setArchiveResult({ ok: true, msg: "歸檔成功 ✓" });
        setTimeout(onArchived, 1200);
      } else {
        setArchiveResult({ ok: false, msg: data.error ?? "歸檔失敗" });
      }
    } catch (e) {
      setArchiveResult({ ok: false, msg: String(e) });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 121px)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-[#EDE0CE] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-stone-800 text-sm truncate block">
            {product.company} · {product.product_name}
          </span>
          <span className="text-xs text-stone-400">{product.filename}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {product.sheetUrl && (
            <a
              href={product.sheetUrl}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Google Sheet
            </a>
          )}
          {archiveResult ? (
            <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${archiveResult.ok ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
              {archiveResult.ok ? <CheckCircle className="h-4 w-4" /> : null}
              {archiveResult.msg}
            </span>
          ) : (
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #4ade80, #16a34a)" }}
            >
              {archiving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Archive className="h-3.5 w-3.5" />}
              {archiving ? "歸檔中…" : "通過審核 · 歸檔"}
            </button>
          )}
        </div>
      </div>

      {/* Split body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: PDF */}
        <div className="w-1/2 border-r border-stone-200 bg-stone-100 overflow-hidden">
          <PdfPanel pdfDriveId={product.pdfDriveId} planCode={product.planCode} />
        </div>

        {/* Right: Analysis */}
        <div className="w-1/2 overflow-y-auto bg-[#FDFAF6]">
          <div className="p-4">
            {analysisLoading ? (
              <div className="flex items-center gap-2 text-stone-400 py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">載入分析資料…</span>
              </div>
            ) : analysisError ? (
              <div className="text-sm text-red-500 py-8 text-center">{analysisError}</div>
            ) : analysisData ? (
              <ItemsEditor
                data={analysisData}
                onDataChange={setAnalysisData}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ReviewQueue ────────────────────────────────────────────────────────

function ReviewQueue({
  products,
  onSelect,
}: {
  products: ReviewProduct[];
  onSelect: (p: ReviewProduct) => void;
}) {
  if (products.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-stone-300">
      <CheckCircle className="h-14 w-14 mb-4 text-emerald-200" />
      <p className="text-sm font-medium text-stone-400">沒有待審核的保單</p>
      <p className="text-xs text-stone-300 mt-1">所有資料都已歸檔完畢</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {products.map(p => (
        <div
          key={p.id}
          onClick={() => onSelect(p)}
          className="flex items-center justify-between px-4 py-3.5 bg-white border border-[#EDE0CE] rounded-xl cursor-pointer hover:bg-[#FBF0E3] hover:border-[#D4A882] transition-all group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-800 truncate">{p.company}</p>
            <p className="text-sm text-stone-600 truncate">{p.product_name}</p>
            <p className="text-xs text-stone-400 mt-0.5 font-mono">{p.planCode}</p>
          </div>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {p.uploadedAt && (
              <span className="text-xs text-stone-400">{p.uploadedAt}</span>
            )}
            <span className="text-[#C8956C] text-sm group-hover:translate-x-0.5 transition-transform">→</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ReviewView export ─────────────────────────────────────────────

export default function ReviewView() {
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReviewProduct | null>(null);

  const loadProducts = useCallback(() => {
    setLoading(true);
    fetch("/api/review")
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">載入待審核清單…</span>
    </div>
  );

  if (selected) return (
    <ReviewDetail
      product={selected}
      onBack={() => setSelected(null)}
      onArchived={() => { setSelected(null); loadProducts(); }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-[#C8956C]" />
        <span className="text-sm font-medium text-stone-600">
          待審核：{products.length} 筆
        </span>
      </div>
      <ReviewQueue products={products} onSelect={setSelected} />
    </div>
  );
}

export function useReviewCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch("/api/review")
      .then(r => r.json())
      .then(d => setCount(d.count ?? 0))
      .catch(() => {});
  }, []);
  return count;
}
