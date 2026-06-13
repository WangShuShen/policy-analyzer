"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft, CheckCircle, Loader2, ClipboardCheck,
  ExternalLink, Archive, Save, Plus, Trash2, Sparkles,
} from "lucide-react";
import type { FormulaItem, FormulaJson } from "@/lib/db";

const PdfViewerWithPages = dynamic(() => import("./PdfViewerWithPages"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full gap-2 text-stone-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">載入 PDF 閱讀器…</span>
    </div>
  ),
});

// ── Types ──────────────────────────────────────────────────────────────

export interface ReviewProduct {
  id: string;          // pdfUUID（uuid_registry.json 的 key）
  planCode: string;
  company: string;
  product_name: string;
  sheetUrl: string;
  pdfDriveId: string;
  filename: string;
  uploadedAt: string;
  category: string | null;
  assignmentStatus?: string;
}

interface AnalysisItem {
  name: string;
  formula: string;
  unit?: string;
  restriction?: string;
  notes?: string;
  pageRef?: number | null;
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

// ── Unified Items + Formula Editor ────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  fixed:         "定額",
  multiplier:    "倍率",
  reimbursement: "限額（實支）",
  range:         "範圍型",
  lump_sum:      "一次性給付",
};

interface UnifiedItem extends AnalysisItem {
  fType: FormulaItem["type"];
  fMultiplier?: number;
  fRateType?: "multiplier" | "percentage";
  fMinRate?: number;
  fMaxRate?: number;
  fLimitDays?: number;
}

function suggestFType(item: AnalysisItem): Partial<UnifiedItem> {
  const f = item.formula ?? "";
  if (f.includes("～") || f.includes("~") || f.includes("至")) {
    const nums = [...f.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1])).filter(n => n > 0);
    return { fType: "range", fRateType: f.includes("%") ? "percentage" : "multiplier", fMinRate: nums[0] ?? 1, fMaxRate: nums[1] ?? nums[0] ?? 1 };
  }
  const pct = f.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return { fType: "multiplier", fMultiplier: parseFloat(pct[1]) / 100 };
  const mult = f.match(/[×x*]\s*(\d+(?:\.\d+)?)/);
  const m = mult ? parseFloat(mult[1]) : 1;
  if (/一次|診斷|確診|身故|全殘/.test(item.name + f)) return { fType: "lump_sum", fMultiplier: m };
  return { fType: "fixed", fMultiplier: m };
}

function mergeItems(analysisItems: AnalysisItem[], formulaItems: FormulaItem[]): UnifiedItem[] {
  return analysisItems.map((a, i) => {
    const f = formulaItems[i];
    if (f) {
      return {
        ...a,
        fType: f.type,
        fMultiplier: f.multiplier,
        fRateType: f.rate_type,
        fMinRate: f.min_rate,
        fMaxRate: f.max_rate,
        fLimitDays: f.limit?.days,
      };
    }
    return { ...a, ...suggestFType(a) } as UnifiedItem;
  });
}

function toFormulaItem(u: UnifiedItem): FormulaItem {
  return {
    label: u.name,
    type: u.fType,
    multiplier: u.fMultiplier,
    rate_type: u.fRateType,
    min_rate: u.fMinRate,
    max_rate: u.fMaxRate,
    limit: u.fLimitDays ? { days: u.fLimitDays } : undefined,
  };
}

function UnifiedItemsEditor({
  data,
  items,
  baseUnit,
  productId,
  formulaVerified,
  onDataChange,
  onItemsChange,
  onBaseUnitChange,
  onItemClick,
  activePage,
}: {
  data: AnalysisData;
  items: UnifiedItem[];
  baseUnit: string;
  productId: number | null;
  formulaVerified: boolean;
  onDataChange: (d: AnalysisData) => void;
  onItemsChange: (items: UnifiedItem[]) => void;
  onBaseUnitChange: (u: string) => void;
  onItemClick?: (page: number) => void;
  activePage?: number;
}) {
  const insuranceTypes = Array.isArray(data.insuranceType) ? data.insuranceType.join("、") : data.insuranceType ?? "";

  const updateAnalysis = (idx: number, field: keyof AnalysisItem, val: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    onItemsChange(next);
    onDataChange({ ...data, items: next.map(it => ({ name: it.name, formula: it.formula, unit: it.unit, restriction: it.restriction, notes: it.notes, pageRef: it.pageRef })) });
  };

  const updateFormula = (idx: number, patch: Partial<UnifiedItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onItemsChange(next);
  };

  const addItem = () => {
    const blank: UnifiedItem = { name: "", formula: "", fType: "fixed", fMultiplier: 1 };
    onItemsChange([...items, blank]);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onItemsChange(next);
    onDataChange({ ...data, items: next.map(it => ({ name: it.name, formula: it.formula, unit: it.unit, restriction: it.restriction, notes: it.notes, pageRef: it.pageRef })) });
  };

  const suggestAll = () => {
    onItemsChange(items.map(it => ({ ...it, ...suggestFType(it) })));
  };

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-1.5">
        {[["保險公司", data.company], ["保單名稱", data.productName], ["險種", insuranceTypes], ["給付基礎", data.baseType]]
          .filter(([, v]) => v).map(([label, val]) => (
            <div key={label as string} className="flex gap-3 text-sm">
              <span className="text-stone-400 w-20 shrink-0">{label as string}</span>
              <span className="text-stone-700 font-medium">{val as string}</span>
            </div>
          ))}
        <div className="flex gap-3 items-center pt-1 border-t border-amber-100 mt-1">
          <span className="text-stone-400 w-20 shrink-0 text-xs">保額單位</span>
          <select
            value={baseUnit}
            onChange={e => onBaseUnitChange(e.target.value)}
            className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            {["元/日", "萬", "元/月", "元"].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {formulaVerified && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 ml-1">
              公式已確認
            </span>
          )}
          {productId && (
            <button onClick={suggestAll} className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 transition-colors">
              <Sparkles className="h-3 w-3" />
              AI 自動建議公式
            </button>
          )}
        </div>
      </div>

      {/* Unified items */}
      {items.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">📋 給付項目 + 公式</span>
            <span className="text-xs text-stone-400">點擊文字欄位可編輯</span>
          </div>

          <div className="divide-y divide-stone-50">
            {items.map((item, idx) => {
              const isActive = item.pageRef != null && item.pageRef === activePage;
              const isRange = item.fType === "range";
              return (
                <div
                  key={idx}
                  className={`px-3 py-2.5 transition-colors ${isActive ? "bg-amber-50 border-l-2 border-l-amber-400" : "hover:bg-stone-50/60"}`}
                >
                  {/* Row 1: name | ai formula text | page */}
                  <div className="flex items-start gap-2 mb-1.5">
                    {/* Name */}
                    <div className="w-28 shrink-0">
                      <InlineEdit
                        value={item.name}
                        onChange={v => updateAnalysis(idx, "name", v)}
                        className="font-semibold text-stone-800"
                      />
                    </div>
                    {/* AI formula text */}
                    <div className="flex-1 min-w-0">
                      <InlineEdit
                        value={item.formula}
                        onChange={v => updateAnalysis(idx, "formula", v)}
                        className="text-stone-500 font-mono"
                        placeholder="AI 公式文字"
                      />
                      {item.restriction && (
                        <InlineEdit
                          value={item.restriction}
                          onChange={v => updateAnalysis(idx, "restriction", v)}
                          className="text-[10px] text-stone-400 mt-0.5"
                        />
                      )}
                    </div>
                    {/* Page */}
                    <button
                      onClick={() => item.pageRef != null && onItemClick?.(item.pageRef)}
                      className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                        item.pageRef != null
                          ? isActive ? "bg-amber-400 text-white" : "bg-stone-100 text-stone-500 hover:bg-amber-100 cursor-pointer"
                          : "text-stone-200"
                      }`}
                    >
                      {item.pageRef != null ? `P.${item.pageRef}` : "—"}
                    </button>
                    {/* Remove */}
                    <button onClick={() => removeItem(idx)} className="shrink-0 text-stone-200 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Row 2: formula structure (only if productId exists) */}
                  {productId && (
                    <div className="flex items-center gap-1.5 ml-28 flex-wrap">
                      <span className="text-[10px] text-stone-300">公式：</span>
                      <select
                        value={item.fType}
                        onChange={e => updateFormula(idx, { fType: e.target.value as FormulaItem["type"] })}
                        className="text-[10px] border border-stone-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#C8956C]"
                      >
                        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>

                      {isRange ? (
                        <>
                          <select
                            value={item.fRateType ?? "multiplier"}
                            onChange={e => updateFormula(idx, { fRateType: e.target.value as "multiplier" | "percentage" })}
                            className="text-[10px] border border-stone-200 rounded px-1 py-0.5 bg-white focus:outline-none"
                          >
                            <option value="multiplier">倍</option>
                            <option value="percentage">%</option>
                          </select>
                          <input type="number" min={0} step={0.5} placeholder="最低"
                            value={item.fMinRate ?? ""}
                            onChange={e => updateFormula(idx, { fMinRate: parseFloat(e.target.value) || 0 })}
                            className="w-14 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]"
                          />
                          <span className="text-[10px] text-stone-400">～</span>
                          <input type="number" min={0} step={0.5} placeholder="最高"
                            value={item.fMaxRate ?? ""}
                            onChange={e => updateFormula(idx, { fMaxRate: parseFloat(e.target.value) || 0 })}
                            className="w-14 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]"
                          />
                          <span className="text-[10px] text-stone-400">{item.fRateType === "percentage" ? "%" : "倍"}</span>
                        </>
                      ) : (
                        <>
                          <input type="number" min={0} step={0.5} placeholder="倍數"
                            value={item.fMultiplier ?? ""}
                            onChange={e => updateFormula(idx, { fMultiplier: parseFloat(e.target.value) || 0 })}
                            className="w-14 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]"
                          />
                          <span className="text-[10px] text-stone-400">倍</span>
                        </>
                      )}
                      <span className="text-stone-200 mx-1">|</span>
                      <input type="number" min={0} placeholder="天上限"
                        value={item.fLimitDays ?? ""}
                        onChange={e => updateFormula(idx, { fLimitDays: parseInt(e.target.value) || undefined })}
                        className="w-16 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none text-stone-500"
                      />
                      <span className="text-[10px] text-stone-400">天/年</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-2.5 border-t border-stone-100">
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-stone-400 hover:text-[#C8956C] transition-colors">
              <Plus className="h-3.5 w-3.5" />
              新增給付項目
            </button>
          </div>
        </div>
      )}

      {/* Annual limit */}
      {data.annualLimit?.formula && (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 mb-1">📊 年度給付上限</p>
          <p className="text-xs text-stone-700">{data.annualLimit.formula}</p>
          {data.annualLimit.notes && <p className="text-xs text-stone-400 mt-1">{data.annualLimit.notes}</p>}
        </div>
      )}
      {data.waitingPeriod?.note && (
        <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 mb-1">⏳ 等待期</p>
          <p className="text-xs text-stone-700">{data.waitingPeriod.note}</p>
        </div>
      )}
      {data.exclusions && data.exclusions.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-yellow-700">⚠️ 除外責任</span>
          </div>
          <div className="px-4 py-2 space-y-1">
            {data.exclusions.map((e, i) => <p key={i} className="text-xs text-red-600">❌ {e}</p>)}
          </div>
        </div>
      )}
      {data.specialRestrictions && data.specialRestrictions.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-indigo-700">📌 特殊限制</span>
          </div>
          <div className="px-4 py-2 space-y-1">
            {data.specialRestrictions.map((r, i) => <p key={i} className="text-xs text-indigo-700">• {r}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineEdit({ value, onChange, className = "", placeholder = "" }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = () => { setEditing(false); if (draft !== value) onChange(draft); };
  return editing ? (
    <textarea autoFocus rows={2}
      className={`w-full text-xs border border-amber-300 rounded px-1 py-0.5 bg-amber-50 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 ${className}`}
      value={draft} onChange={e => setDraft(e.target.value)} onBlur={save}
      onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
    />
  ) : (
    <span className={`block text-xs cursor-pointer hover:bg-amber-50 rounded px-0.5 whitespace-pre-wrap transition-colors ${className}`}
      onClick={() => { setDraft(value); setEditing(true); }} title="點擊編輯">
      {value || <span className="text-stone-300 italic text-[10px]">{placeholder || "—"}</span>}
    </span>
  );
}

// ── ReviewDetail ───────────────────────────────────────────────────────

export function ReviewDetail({
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
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activePage, setActivePage] = useState(1);

  // Unified state for items + formula
  const [unifiedItems, setUnifiedItems] = useState<UnifiedItem[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [baseUnit, setBaseUnit] = useState("元/日");
  const [formulaVerified, setFormulaVerified] = useState(false);

  const pdfUrl = `/api/pdf-proxy/local?planCode=${encodeURIComponent(product.planCode)}&driveId=${encodeURIComponent(product.pdfDriveId)}`;

  // Load analysis data
  useEffect(() => {
    fetch(`/api/review/${product.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setAnalysisError(d.error); return; }
        setAnalysisData(d);
        // Formula load happens after analysis items are known
      })
      .catch(e => setAnalysisError(String(e)))
      .finally(() => setAnalysisLoading(false));
  }, [product.id]);

  // Load formula from DB and merge with analysis items
  useEffect(() => {
    if (!analysisData) return;
    const items = analysisData.items ?? [];
    if (!product.planCode) {
      setUnifiedItems(items.map(a => ({ ...a, ...suggestFType(a) } as UnifiedItem)));
      return;
    }
    fetch(`/api/products?planCode=${encodeURIComponent(product.planCode)}`)
      .then(r => r.json())
      .then(d => {
        const p = d.product;
        if (p) {
          setProductId(p.id as number);
          setFormulaVerified(!!p.formula_verified);
          if (p.formula_json) {
            const fj = p.formula_json as FormulaJson;
            setBaseUnit(fj.base_unit);
            setUnifiedItems(mergeItems(items, fj.items));
            return;
          }
        }
        setUnifiedItems(items.map(a => ({ ...a, ...suggestFType(a) } as UnifiedItem)));
      })
      .catch(() => {
        setUnifiedItems(items.map(a => ({ ...a, ...suggestFType(a) } as UnifiedItem)));
      });
  }, [analysisData, product.planCode]);

  const handleSave = async () => {
    if (!analysisData) return;
    setSaving(true);
    setSaveResult(null);
    try {
      // Build updated analysisData from unified items
      const updatedData: AnalysisData = {
        ...analysisData,
        items: unifiedItems.map(it => ({
          name: it.name, formula: it.formula, unit: it.unit,
          restriction: it.restriction, notes: it.notes, pageRef: it.pageRef,
        })),
      };

      // 1) Save analysis JSON
      const res = await fetch(`/api/review/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: updatedData, sheetUrl: product.sheetUrl }),
      });
      const result = await res.json();
      if (!result.success) {
        setSaveResult({ ok: false, msg: result.error ?? "分析儲存失敗" });
        return;
      }

      // 2) Save formula to DB (if product found)
      if (productId && unifiedItems.length > 0) {
        const formulaPayload: FormulaJson = {
          base_unit: baseUnit,
          items: unifiedItems.map(toFormulaItem),
          filled_by: "",
          filled_at: "",
        };
        const fRes = await fetch(`/api/products/${productId}/formula`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formula: formulaPayload }),
        });
        const fData = await fRes.json();
        if (fData.ok) setFormulaVerified(true);
      }

      setAnalysisData(updatedData);
      setIsDirty(false);
      setSaveResult({ ok: true, msg: "已儲存 ✓" });
      setTimeout(() => setSaveResult(null), 2000);
    } catch (e) {
      setSaveResult({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm(`確認歸檔「${product.product_name}」？\n歸檔後將從待審核區移至正式資料庫。`)) return;
    setArchiving(true);
    setArchiveResult(null);
    try {
      const res = await fetch(`/api/review/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: product.sheetUrl, pdfDriveId: product.pdfDriveId }),
      });
      const data = await res.json();
      if (data.success) {
        window.dispatchEvent(new Event("review-archived"));
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
    <div className="flex flex-col flex-1 min-h-0">
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
          {saveResult ? (
            <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${saveResult.ok ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"}`}>
              {saveResult.ok ? <CheckCircle className="h-4 w-4" /> : null}
              {saveResult.msg}
            </span>
          ) : isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "儲存中…" : "儲存 + 確認公式"}
            </button>
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
        <div className="w-1/2 border-r border-stone-200 overflow-hidden">
          <PdfViewerWithPages
            pdfUrl={pdfUrl}
            currentPage={activePage}
          />
        </div>

        {/* Right: Unified editor */}
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
              <UnifiedItemsEditor
                data={analysisData}
                items={unifiedItems}
                baseUnit={baseUnit}
                productId={productId}
                formulaVerified={formulaVerified}
                onDataChange={d => { setAnalysisData(d); setIsDirty(true); }}
                onItemsChange={items => { setUnifiedItems(items); setIsDirty(true); }}
                onBaseUnitChange={u => { setBaseUnit(u); setIsDirty(true); }}
                onItemClick={setActivePage}
                activePage={activePage}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ReviewQueue ────────────────────────────────────────────────────────

export function ReviewQueue({
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
            {p.assignmentStatus === "completed" ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle className="h-3 w-3" /> 已完成
              </span>
            ) : p.assignmentStatus === "pending" ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                待審核
              </span>
            ) : p.uploadedAt && (
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
    const fetchCount = () => {
      fetch("/api/review")
        .then(r => r.json())
        .then(d => setCount(d.count ?? 0))
        .catch(() => {});
    };
    fetchCount();
    window.addEventListener("review-archived", fetchCount);
    return () => window.removeEventListener("review-archived", fetchCount);
  }, []);
  return count;
}
