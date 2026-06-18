"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft, CheckCircle, Loader2, ClipboardCheck,
  ExternalLink, Archive, Save, Plus, Trash2, Sparkles,
} from "lucide-react";
import type { FormulaItem, FormulaJson } from "@/lib/db";
import { suggestFormula } from "@/lib/insuranceRules";

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
  formula?: string;
  unit?: string;
  restriction?: string;
  notes?: string;
  pageRef?: number | null;
  // AI 新格式（金額來源）
  valueSource?: "plan" | "table" | "insured" | "unit" | "fixed" | "note";
  isLimit?: boolean;        // 性質＝限額（正交於金額來源）
  planValues?: Record<string, number>;
  tableRange?: { min: number; max: number };
  insuredRate?: { type: "multiplier" | "percentage"; rate?: number; min?: number; max?: number };
  amount?: number;
}

interface AnalysisData {
  company?: string;
  productName?: string;
  planCode?: string;
  insuranceType?: string[];
  baseType?: string;
  baseUnit?: string;        // 保額單位（元/美元/萬元/計劃別/單位數）
  plans?: string[];         // 計劃別清單
  planScale?: boolean;      // 計劃別=等比放大（輸入計劃號×N）；false/未設=各計劃獨立(列舉)
  items?: AnalysisItem[];
  annualLimit?: { formula?: string; notes?: string };
  waitingPeriod?: { disease?: number; injury?: number; note?: string };
  exclusions?: string[];
  specialRestrictions?: string[];
}

// ── Unified Items + Formula Editor ────────────────────────────────────

type VSource = "plan" | "table" | "insured" | "unit" | "fixed" | "note";

// 計算基準（整張保單）：保額 / 計劃別 / 單位 三選一
type BaseMode = "insured" | "plan" | "unit";
const baseUnitToMode = (u: string): BaseMode => u === "計劃別" ? "plan" : u === "單位數" ? "unit" : "insured";
const followSourceOf = (m: BaseMode): VSource => m === "plan" ? "plan" : m === "unit" ? "unit" : "insured";

// 每個項目的兩維度（UI 控制）：性質 × 來源 → 推導出 value_source
// 性質 vShape：fixed(定額) / limit(限額) / range(範圍最低~最高) / note(說明型，不試算)；來源 vSrc：follow(隨基準) / fixed(固定)
type VShape = "fixed" | "limit" | "range" | "note";
type VSrc = "follow" | "fixed";
const shapeOf = (it: { vSource: VSource; vIsLimit?: boolean; vMinRate?: number; vMaxRate?: number }): VShape => {
  if (it.vSource === "note") return "note";
  if (it.vSource === "table") return "range";
  if (it.vSource === "insured" && (it.vMinRate != null || it.vMaxRate != null)) return "range";
  return it.vIsLimit ? "limit" : "fixed";
};
const srcOf = (it: { vSource: VSource }): VSrc =>
  (it.vSource === "insured" || it.vSource === "plan" || it.vSource === "unit") ? "follow" : "fixed";
// 由 性質+來源+基準 推導 value_source
const resolveVSource = (shape: VShape, src: VSrc, base: BaseMode): VSource => {
  if (shape === "note") return "note";
  if (shape === "range") return (src === "follow" && base === "insured") ? "insured" : "table";
  return src === "follow" ? followSourceOf(base) : "fixed";
};

interface UnifiedItem extends AnalysisItem {
  vSource: VSource;
  vUnit: string;
  vIsLimit?: boolean;    // 性質＝限額
  // insured（保額計算）
  vRateType?: "multiplier" | "percentage";
  vRate?: number;        // 單一倍率
  vMinRate?: number;     // 範圍最低
  vMaxRate?: number;     // 範圍最高
  // table（附表）
  vTableMin?: number;
  vTableMax?: number;
  // fixed
  vAmount?: number;
  // plan
  fPlanValues?: Record<string, number>;
  // 共用
  fLimitDays?: number;
}

// 從 AI 分析項目建立 UnifiedItem：優先用 AI 新格式欄位，否則用規則 + 公式文字推斷
function suggestSource(item: AnalysisItem, category = ""): Partial<UnifiedItem> {
  const base = suggestFormula(item.name, category);
  const out: Partial<UnifiedItem> = {
    vSource: (item.valueSource as VSource) ?? base.valueSource,
    vUnit: item.unit || base.unit,
    vIsLimit: item.isLimit ?? base.isLimit,
  };
  if (item.planValues && Object.keys(item.planValues).length > 0) out.fPlanValues = item.planValues;
  if (item.tableRange) { out.vTableMin = item.tableRange.min; out.vTableMax = item.tableRange.max; }
  if (item.insuredRate) {
    out.vRateType = item.insuredRate.type;
    out.vRate = item.insuredRate.rate;
    out.vMinRate = item.insuredRate.min;
    out.vMaxRate = item.insuredRate.max;
  }
  if (item.amount != null) out.vAmount = item.amount;

  // 若 AI 未給結構化值，從公式文字補推（相容舊資料）
  if (!item.valueSource && item.formula) {
    const f = item.formula;
    const nums = [...f.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1])).filter(n => n > 0);
    if (out.vSource === "table") { out.vTableMin = nums[0] ?? 0; out.vTableMax = nums[1] ?? nums[0] ?? 0; }
    else if (out.vSource === "insured") {
      out.vRateType = f.includes("%") ? "percentage" : "multiplier";
      const isRange = f.includes("～") || f.includes("~") || f.includes("至");
      if (isRange) { out.vMinRate = nums[0]; out.vMaxRate = nums[1] ?? nums[0]; }
      else out.vRate = f.includes("%") ? (nums[0] ?? 100) : (nums[0] ?? 1);
    } else if (out.vSource === "fixed") out.vAmount = nums[0] ?? 0;
  }
  return out;
}

function mergeItems(analysisItems: AnalysisItem[], formulaItems: FormulaItem[], category = ""): UnifiedItem[] {
  return analysisItems.map((a, i) => {
    const f = formulaItems[i];
    if (f && f.value_source) {
      return {
        ...a,
        vSource: f.value_source as VSource,
        vUnit: f.unit,
        vRateType: f.insured_rate?.type,
        vRate: f.insured_rate?.rate,
        vMinRate: f.insured_rate?.min,
        vMaxRate: f.insured_rate?.max,
        vTableMin: f.table_range?.min,
        vTableMax: f.table_range?.max,
        vAmount: f.amount,
        vIsLimit: f.is_limit,
        fPlanValues: f.plan_values,
        fLimitDays: f.limit?.days,
      } as UnifiedItem;
    }
    return { ...a, ...suggestSource(a, category) } as UnifiedItem;
  });
}

// 由分析資料組出「險種字串」供規則比對（險種 + 給付基礎 + 商品類型）
function categoryOf(data: AnalysisData): string {
  const t = Array.isArray(data.insuranceType) ? data.insuranceType.join(" ") : (data.insuranceType ?? "");
  return [t, data.baseType ?? "", data.productName ?? ""].join(" ");
}

function toFormulaItem(u: UnifiedItem): FormulaItem {
  const fi: FormulaItem = { label: u.name, value_source: u.vSource, unit: u.vUnit,
    is_limit: u.vIsLimit || undefined,
    limit: u.fLimitDays ? { days: u.fLimitDays } : undefined,
    restriction: u.restriction, note: u.notes };
  if (u.vSource === "plan" && u.fPlanValues && Object.keys(u.fPlanValues).length > 0) fi.plan_values = u.fPlanValues;
  if (u.vSource === "table") fi.table_range = { min: u.vTableMin ?? 0, max: u.vTableMax ?? 0 };
  if (u.vSource === "insured") fi.insured_rate = { type: u.vRateType ?? "multiplier", rate: u.vRate, min: u.vMinRate, max: u.vMaxRate };
  if (u.vSource === "fixed" || u.vSource === "unit") fi.amount = u.vAmount ?? 0;
  return fi;
}

function UnifiedItemsEditor({
  data,
  items,
  baseUnit,
  plans,
  productId,
  formulaVerified,
  onDataChange,
  onItemsChange,
  onBaseUnitChange,
  onPlansChange,
  onItemClick,
  activePage,
}: {
  data: AnalysisData;
  items: UnifiedItem[];
  baseUnit: string;
  plans: string[];
  productId: number | null;
  formulaVerified: boolean;
  onDataChange: (d: AnalysisData) => void;
  onItemsChange: (items: UnifiedItem[]) => void;
  onBaseUnitChange: (u: string) => void;
  onPlansChange: (plans: string[]) => void;
  onItemClick?: (page: number) => void;
  activePage?: number;
}) {
  const insuranceTypes = Array.isArray(data.insuranceType) ? data.insuranceType.join("、") : data.insuranceType ?? "";

  const updatePlanValue = (idx: number, plan: string, val: number) => {
    const next = [...items];
    const pv = { ...(next[idx].fPlanValues ?? {}) };
    pv[plan] = val;
    next[idx] = { ...next[idx], fPlanValues: pv };
    onItemsChange(next);
  };

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

  const baseMode = baseUnitToMode(baseUnit);
  // 計劃別「等比放大」：項目以 unit 計（×計劃號）；單欄輸入
  const planScale = baseMode === "plan" && !!data.planScale;
  const singleCol = baseMode === "unit" || planScale;      // 矩陣單值欄（vs 各計劃多欄）
  const effBase: BaseMode = planScale ? "unit" : baseMode;  // 來源推導用：等比視同單位
  const effFollow = followSourceOf(effBase);                // 隨基準的來源（plan/unit/insured）
  // 「隨基準變動」的來源（切基準時這些要跟著換；固定/附表不動）
  const FOLLOWS_BASE: VSource[] = ["insured", "plan", "unit"];
  // 切換計算基準：只把「隨基準」的項目換成新基準的來源；固定/附表項目維持原樣
  const setBaseMode = (m: BaseMode) => {
    onBaseUnitChange(m === "plan" ? "計劃別" : m === "unit" ? "單位數" : (["元", "美元", "萬元"].includes(baseUnit) ? baseUnit : "萬元"));
    const follow: VSource = m === "plan" && data.planScale ? "unit" : followSourceOf(m);
    onItemsChange(items.map(it => {
      if (!FOLLOWS_BASE.includes(it.vSource)) return it;       // 固定/附表 不動
      // 清掉舊的 valueSource，避免 suggestSource 讀到殘留值把基準切換又還原回去
      if (m !== "insured" && shapeOf(it) === "range") return { ...it, valueSource: undefined, vSource: "table" } as UnifiedItem;
      if (m === "insured") {
        // 隨基準 → 保額：單一倍率（沿用既有倍率，否則 ×1）
        return { ...it, valueSource: undefined, vSource: "insured",
          vRateType: it.vRateType ?? "multiplier", vRate: it.vRate ?? 1 } as UnifiedItem;
      }
      return { ...it, valueSource: undefined, vSource: follow } as UnifiedItem;  // 換成 計劃 / 單位
    }));
  };

  // 計劃別 列舉/等比 切換：等比→項目以 unit 計、列舉→plan
  const setPlanScale = (scale: boolean) => {
    onDataChange({ ...data, planScale: scale });
    const follow: VSource = scale ? "unit" : "plan";
    onItemsChange(items.map(it => (it.vSource === "plan" || it.vSource === "unit") ? { ...it, vSource: follow } as UnifiedItem : it));
  };

  // 設定某項目的「性質 + 來源」，推導並寫入 value_source 與相關欄位
  const applyShapeSrc = (idx: number, shape: VShape, src: VSrc) => {
    const it = items[idx];
    const vs = resolveVSource(shape, src, effBase);
    const patch: Partial<UnifiedItem> = { vSource: vs, vIsLimit: shape === "limit" };
    if (vs === "insured") {
      if (shape === "range") { patch.vRate = undefined; patch.vMinRate = it.vMinRate ?? it.vRate ?? 0; patch.vMaxRate = it.vMaxRate ?? it.vRate ?? 0; }
      else { patch.vMinRate = undefined; patch.vMaxRate = undefined; patch.vRate = it.vRate ?? 1; }
    }
    updateFormula(idx, patch);
  };

  const addItem = () => {
    const blank: UnifiedItem = { name: "", formula: "", vSource: effFollow, vUnit: "元", vAmount: 0 };
    onItemsChange([...items, blank]);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onItemsChange(next);
    onDataChange({ ...data, items: next.map(it => ({ name: it.name, formula: it.formula, unit: it.unit, restriction: it.restriction, notes: it.notes, pageRef: it.pageRef })) });
  };

  const suggestAll = () => {
    const cat = categoryOf(data);
    onItemsChange(items.map(it => ({ ...it, ...suggestSource(it, cat) })));
  };

  // ── 給付限制／注意事項 編輯 ──
  const setAnnualLimit = (patch: Partial<NonNullable<AnalysisData["annualLimit"]>>) =>
    onDataChange({ ...data, annualLimit: { ...data.annualLimit, ...patch } });
  const setWaitingNote = (note: string) =>
    onDataChange({ ...data, waitingPeriod: { ...data.waitingPeriod, note } });

  const setList = (key: "exclusions" | "specialRestrictions", arr: string[]) =>
    onDataChange({ ...data, [key]: arr });
  const updateListItem = (key: "exclusions" | "specialRestrictions", i: number, v: string) => {
    const arr = [...(data[key] ?? [])]; arr[i] = v; setList(key, arr);
  };
  const addListItem = (key: "exclusions" | "specialRestrictions") =>
    setList(key, [...(data[key] ?? []), ""]);
  const removeListItem = (key: "exclusions" | "specialRestrictions", i: number) =>
    setList(key, (data[key] ?? []).filter((_, idx) => idx !== i));

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
          <span className="text-stone-400 w-20 shrink-0 text-xs">計算基準</span>
          {/* 保額 / 計劃別 / 單位 三選一 */}
          <div className="inline-flex rounded-lg overflow-hidden border border-amber-200">
            {([["insured", "保額"], ["plan", "計劃別"], ["unit", "單位"]] as [BaseMode, string][]).map(([m, label], i) => (
              <button key={m} type="button" onClick={() => setBaseMode(m)}
                className={`text-xs px-3 py-1 ${i > 0 ? "border-l border-amber-200" : ""} ${baseMode === m ? "bg-[#C8956C] text-white font-medium" : "bg-white text-stone-500 hover:bg-amber-50"}`}
              >{label}</button>
            ))}
          </div>
          {/* 保額基準下，挑保額單位 */}
          {baseMode === "insured" && (
            <select
              value={baseUnit}
              onChange={e => onBaseUnitChange(e.target.value)}
              className="text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              {["元", "美元", "萬元"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
          {baseMode === "unit" && <span className="text-[11px] text-stone-400">每壹單位給付金額（下方逐項填）</span>}
          {formulaVerified && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 ml-1">
              公式已確認
            </span>
          )}
          {(
            <button onClick={suggestAll} className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 transition-colors">
              <Sparkles className="h-3 w-3" />
              AI 自動建議公式
            </button>
          )}
        </div>
        {/* 計劃別：列舉(各計劃獨立) / 等比(輸入計劃號×N) */}
        {baseMode === "plan" && (
          <>
            <div className="flex gap-3 items-center pt-1">
              <span className="text-stone-400 w-20 shrink-0 text-xs">計劃別類型</span>
              <div className="inline-flex rounded-lg overflow-hidden border border-amber-200 text-xs">
                <button type="button" onClick={() => setPlanScale(false)}
                  className={`px-3 py-1 ${!planScale ? "bg-[#C8956C] text-white font-medium" : "bg-white text-stone-500 hover:bg-amber-50"}`}>列舉（各計劃獨立）</button>
                <button type="button" onClick={() => setPlanScale(true)}
                  className={`px-3 py-1 border-l border-amber-200 ${planScale ? "bg-[#C8956C] text-white font-medium" : "bg-white text-stone-500 hover:bg-amber-50"}`}>等比（計劃號×N）</button>
              </div>
            </div>
            {!planScale && (
              <div className="flex gap-3 items-center pt-1">
                <span className="text-stone-400 w-20 shrink-0 text-xs">計劃清單</span>
                <input
                  value={plans.join(",")}
                  onChange={e => onPlansChange(e.target.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean))}
                  placeholder="填入各計劃，逗號分隔，如 1,2,3,4,5 或 A,B,C"
                  className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 text-stone-700"
                />
              </div>
            )}
            {planScale && (
              <p className="text-[11px] text-stone-400 pt-1 ml-[5.5rem]">等比型：下方每項填「每計劃金額（基數）」，試算時 × 計劃號</p>
            )}
          </>
        )}
      </div>

      {/* Unified items（保額基準：各項目自選金額來源）*/}
      {items.length > 0 && baseMode === "insured" && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">📋 給付項目 + 公式</span>
            <span className="text-xs text-stone-400">點擊文字欄位可編輯</span>
          </div>

          <div className="divide-y divide-stone-50">
            {items.map((item, idx) => {
              const isActive = item.pageRef != null && item.pageRef === activePage;
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
                        value={item.formula ?? ""}
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

                  {/* Row 2: 金額來源 value_source + 對應數值 */}
                  {(
                    <div className="flex items-center gap-1.5 ml-28 flex-wrap">
                      {(() => {
                        const shape = shapeOf(item);
                        const src = srcOf(item);
                        const isPct = (item.vRateType ?? "multiplier") === "percentage";
                        const rsfx = isPct ? "%" : "倍";
                        const limPfx = shape === "limit" ? "限額 " : "";
                        let preview = "";
                        if (src === "follow") {
                          const ratePfx = shape === "limit" ? "限額＝保額" : "保額";
                          preview = shape === "range"
                            ? (item.vMinRate != null && item.vMaxRate != null ? `${ratePfx} × ${item.vMinRate}${rsfx} ～ ${item.vMaxRate}${rsfx}` : "")
                            : (item.vRate != null ? `${ratePfx} × ${item.vRate}${rsfx}` : "");
                        } else {
                          preview = shape === "range"
                            ? (item.vTableMin != null && item.vTableMax != null ? `${limPfx}${item.vTableMin} ～ ${item.vTableMax} ${item.vUnit}` : "")
                            : (item.vAmount != null ? `${limPfx}${item.vAmount} ${item.vUnit}` : "");
                        }
                        const shapeBtns: [VShape, string, string][] = [["fixed", "定額", "bg-sky-500"], ["limit", "限額", "bg-emerald-500"], ["range", "範圍", "bg-purple-500"], ["note", "說明", "bg-stone-400"]];
                        return (
                          <>
                            {/* 性質：定額 / 限額 / 範圍 / 說明 */}
                            <div className="inline-flex rounded overflow-hidden border border-stone-200 text-[10px]">
                              {shapeBtns.map(([s, label, color], i) => (
                                <button key={s} type="button" onClick={() => applyShapeSrc(idx, s, src)}
                                  className={`px-1.5 py-0.5 ${i > 0 ? "border-l border-stone-200" : ""} ${shape === s ? `${color} text-white` : "bg-white text-stone-500 hover:bg-stone-50"}`}>{label}</button>
                              ))}
                            </div>
                            {shape === "note" ? (
                              <span className="text-[10px] text-stone-400 italic">依說明文字顯示，不參與試算（在上方公式欄填寫，如「所繳保費」）</span>
                            ) : (
                            <>
                            {/* 來源：隨保額 / 固定 */}
                            <div className="inline-flex rounded overflow-hidden border border-stone-200 text-[10px]">
                              {(["follow", "fixed"] as VSrc[]).map((s, i) => (
                                <button key={s} type="button" onClick={() => applyShapeSrc(idx, shape, s)}
                                  className={`px-1.5 py-0.5 ${i > 0 ? "border-l border-stone-200" : ""} ${src === s ? "bg-[#C8956C] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{s === "follow" ? "隨保額" : "固定"}</button>
                              ))}
                            </div>
                            {/* 單位 */}
                            <select value={item.vUnit} onChange={e => updateFormula(idx, { vUnit: e.target.value })}
                              className="text-[10px] border border-stone-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                              {["萬", "元", "元/日", "元/次", "元/月"].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            {/* 值輸入：依 來源 × 性質 */}
                            {src === "follow" ? (
                              <>
                                <select value={item.vRateType ?? "multiplier"} onChange={e => updateFormula(idx, { vRateType: e.target.value as "multiplier" | "percentage" })}
                                  className="text-[10px] border border-stone-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                                  <option value="multiplier">保額×倍</option>
                                  <option value="percentage">保額×%</option>
                                </select>
                                {shape === "range" ? (
                                  <>
                                    <input type="number" min={0} step="any" inputMode="decimal" placeholder="低" value={item.vMinRate ?? ""}
                                      onChange={e => updateFormula(idx, { vMinRate: parseFloat(e.target.value) || 0 })}
                                      className="w-12 text-[10px] border border-stone-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                    <span className="text-[10px] text-stone-400">{rsfx} ～</span>
                                    <input type="number" min={0} step="any" inputMode="decimal" placeholder="高" value={item.vMaxRate ?? ""}
                                      onChange={e => updateFormula(idx, { vMaxRate: parseFloat(e.target.value) || 0 })}
                                      className="w-12 text-[10px] border border-stone-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                    <span className="text-[10px] text-stone-400">{rsfx}</span>
                                  </>
                                ) : (
                                  <>
                                    <input type="number" min={0} step="any" inputMode="decimal" placeholder={isPct ? "百分比" : "倍率"} value={item.vRate ?? ""}
                                      onChange={e => updateFormula(idx, { vRate: parseFloat(e.target.value) || 0 })}
                                      className="w-14 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                    <span className="text-[10px] text-stone-400">{rsfx}</span>
                                  </>
                                )}
                              </>
                            ) : shape === "range" ? (
                              <>
                                <input type="number" min={0} step="any" inputMode="decimal" placeholder="最低" value={item.vTableMin ?? ""}
                                  onChange={e => updateFormula(idx, { vTableMin: parseFloat(e.target.value) || 0 })}
                                  className="w-16 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                <span className="text-[10px] text-stone-400">～</span>
                                <input type="number" min={0} step="any" inputMode="decimal" placeholder="最高" value={item.vTableMax ?? ""}
                                  onChange={e => updateFormula(idx, { vTableMax: parseFloat(e.target.value) || 0 })}
                                  className="w-16 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                <span className="text-[10px] text-stone-400">{item.vUnit}</span>
                              </>
                            ) : (
                              <>
                                <input type="number" min={0} step="any" inputMode="decimal" placeholder="金額" value={item.vAmount ?? ""}
                                  onChange={e => updateFormula(idx, { vAmount: parseFloat(e.target.value) || 0 })}
                                  className="w-20 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                <span className="text-[10px] text-stone-400">{item.vUnit}</span>
                              </>
                            )}
                            {preview && <span className="text-[10px] text-[#C8956C] font-medium whitespace-nowrap">= {preview}</span>}
                            </>
                            )}
                          </>
                        );
                      })()}

                      {shapeOf(item) !== "note" && <>
                      <span className="text-stone-200 mx-1">|</span>
                      <input type="number" min={0} placeholder="天上限"
                        value={item.fLimitDays ?? ""}
                        onChange={e => updateFormula(idx, { fLimitDays: parseInt(e.target.value) || undefined })}
                        className="w-16 text-[10px] border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none text-stone-500"
                      />
                      <span className="text-[10px] text-stone-400">天/年</span>
                      </>}
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

      {/* 基準公式列表（計劃別 / 單位基準：項目 × 金額 矩陣）*/}
      {items.length > 0 && (baseMode === "plan" || baseMode === "unit") && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">📋 基準公式列表 · {baseMode === "plan" ? (planScale ? "計劃別·等比" : "計劃別") : "單位"}</span>
            <span className="text-xs text-stone-400">{singleCol ? `每個給付項目 · 每${baseMode === "plan" ? "計劃" : "單位"}金額（基數）` : "每個給付項目 × 各計劃金額"}</span>
          </div>
          {baseMode === "plan" && !planScale && plans.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-stone-400">請先在上方「計劃清單」填入各計劃（如 1,2,3,4,5）</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 text-stone-400">
                    <th className="text-left font-medium px-3 py-2 sticky left-0 bg-stone-50">給付項目</th>
                    <th className="font-medium px-2 py-2">性質</th>
                    <th className="font-medium px-2 py-2">來源</th>
                    <th className="font-medium px-2 py-2">單位</th>
                    {!singleCol
                      ? plans.map(pl => <th key={pl} className="font-medium px-2 py-2 text-center whitespace-nowrap">計劃 {pl}</th>)
                      : <th className="font-medium px-2 py-2 text-center whitespace-nowrap">每{baseMode === "plan" ? "計劃" : "單位"}金額</th>}
                    <th className="font-medium px-2 py-2 text-center">頁</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {items.map((item, idx) => {
                    const isActive = item.pageRef != null && item.pageRef === activePage;
                    const shape = shapeOf(item);
                    const src = srcOf(item);
                    const valSpan = singleCol ? 1 : plans.length;
                    const shapeBtns: [VShape, string, string][] = [["fixed", "定額", "bg-sky-500"], ["limit", "限額", "bg-emerald-500"], ["range", "範圍", "bg-purple-500"], ["note", "說明", "bg-stone-400"]];
                    return (
                      <tr key={idx} className={isActive ? "bg-amber-50" : "hover:bg-stone-50/60"}>
                        <td className="px-3 py-1.5 sticky left-0 bg-white">
                          <InlineEdit value={item.name} onChange={v => updateAnalysis(idx, "name", v)} className="font-semibold text-stone-800" />
                        </td>
                        {/* 性質：定額 / 限額 / 範圍 */}
                        <td className="px-2 py-1.5 text-center">
                          <div className="inline-flex rounded overflow-hidden border border-stone-200 text-[10px]">
                            {shapeBtns.map(([s, label, color], i) => (
                              <button key={s} type="button" onClick={() => applyShapeSrc(idx, s, src)}
                                className={`px-1.5 py-0.5 ${i > 0 ? "border-l border-stone-200" : ""} ${shape === s ? `${color} text-white` : "bg-white text-stone-500 hover:bg-stone-50"}`}>{label}</button>
                            ))}
                          </div>
                        </td>
                        {/* 來源：隨基準 / 固定 */}
                        <td className="px-2 py-1.5 text-center">
                          {shape === "note" ? <span className="text-[10px] text-stone-300">—</span> : (
                          <div className="inline-flex rounded overflow-hidden border border-stone-200 text-[10px]">
                            {(["follow", "fixed"] as VSrc[]).map((s, i) => (
                              <button key={s} type="button" onClick={() => applyShapeSrc(idx, shape, s)}
                                className={`px-1.5 py-0.5 ${i > 0 ? "border-l border-stone-200" : ""} ${src === s ? "bg-[#C8956C] text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{s === "follow" ? (baseMode === "plan" ? "隨計劃" : "隨單位") : "固定"}</button>
                            ))}
                          </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {shape === "note" ? <span className="text-[10px] text-stone-300">—</span> : (
                          <select value={item.vUnit} onChange={e => updateFormula(idx, { vUnit: e.target.value })}
                            className="text-[10px] border border-stone-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                            {["萬", "元", "元/日", "元/次", "元/月"].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          )}
                        </td>
                        {shape === "note" ? (
                          <td colSpan={valSpan} className="px-2 py-1.5 text-center text-[10px] text-stone-400 italic">依說明（不試算）</td>
                        ) : shape === "range" ? (
                          <td colSpan={valSpan} className="px-1 py-1.5 text-center whitespace-nowrap">
                            <input type="number" min={0} step="any" inputMode="decimal" placeholder="最低"
                              value={item.vTableMin ?? ""}
                              onChange={e => updateFormula(idx, { vTableMin: parseFloat(e.target.value) || 0 })}
                              className="w-16 text-[10px] border border-amber-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                            <span className="text-[10px] text-stone-400 mx-1">～</span>
                            <input type="number" min={0} step="any" inputMode="decimal" placeholder="最高"
                              value={item.vTableMax ?? ""}
                              onChange={e => updateFormula(idx, { vTableMax: parseFloat(e.target.value) || 0 })}
                              className="w-16 text-[10px] border border-amber-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                            <span className="text-[10px] text-stone-400 ml-1">{item.vUnit}</span>
                          </td>
                        ) : src === "follow" ? (
                          !singleCol
                            ? plans.map(pl => (
                                <td key={pl} className="px-1 py-1.5 text-center">
                                  <input type="number" min={0} step="any" inputMode="decimal"
                                    value={item.fPlanValues?.[pl] ?? ""}
                                    onChange={e => updatePlanValue(idx, pl, parseFloat(e.target.value) || 0)}
                                    className="w-16 text-[10px] border border-amber-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                </td>
                              ))
                            : (
                                <td className="px-1 py-1.5 text-center">
                                  <input type="number" min={0} step="any" inputMode="decimal"
                                    value={item.vAmount ?? ""}
                                    onChange={e => updateFormula(idx, { vAmount: parseFloat(e.target.value) || 0 })}
                                    className="w-20 text-[10px] border border-amber-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                                </td>
                              )
                        ) : (
                          <td colSpan={valSpan} className="px-1 py-1.5 text-center">
                            <input type="number" min={0} step="any" inputMode="decimal" placeholder="金額"
                              value={item.vAmount ?? ""}
                              onChange={e => updateFormula(idx, { vAmount: parseFloat(e.target.value) || 0 })}
                              className="w-24 text-[10px] border border-amber-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-[#C8956C]" />
                            <span className="text-[10px] text-stone-400 ml-1">{item.vUnit}</span>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => item.pageRef != null && onItemClick?.(item.pageRef)}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${item.pageRef != null ? (isActive ? "bg-amber-400 text-white" : "bg-stone-100 text-stone-500 hover:bg-amber-100") : "text-stone-200"}`}>
                            {item.pageRef != null ? `P.${item.pageRef}` : "—"}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => removeItem(idx)} className="text-stone-200 hover:text-red-400 transition-colors"><Trash2 className="h-3 w-3" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-stone-100">
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-stone-400 hover:text-[#C8956C] transition-colors">
              <Plus className="h-3.5 w-3.5" />
              新增給付項目
            </button>
          </div>
        </div>
      )}

      {/* ── 區 2：給付限制 ── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
          <span className="text-sm font-semibold text-stone-600">📊 給付限制</span>
          <span className="text-xs text-stone-400 ml-2">年度上限與等待期</span>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-stone-400">年度給付上限</label>
            <textarea
              rows={2}
              value={data.annualLimit?.formula ?? ""}
              onChange={e => setAnnualLimit({ formula: e.target.value })}
              placeholder="例：年度累計最高 60 萬元；未填代表無上限"
              className="w-full mt-1 text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#C8956C] text-stone-700"
            />
            <input
              value={data.annualLimit?.notes ?? ""}
              onChange={e => setAnnualLimit({ notes: e.target.value })}
              placeholder="補充說明（選填）"
              className="w-full mt-1 text-[11px] border border-stone-100 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#C8956C] text-stone-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-stone-400">等待期</label>
            <input
              value={data.waitingPeriod?.note ?? ""}
              onChange={e => setWaitingNote(e.target.value)}
              placeholder="例：疾病等待期 30 天，意外無等待期"
              className="w-full mt-1 text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#C8956C] text-stone-700"
            />
          </div>
        </div>
      </div>

      {/* ── 區 3：注意事項 ── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100">
          <span className="text-sm font-semibold text-stone-600">⚠️ 注意事項</span>
          <span className="text-xs text-stone-400 ml-2">除外責任與特殊限制</span>
        </div>
        <div className="px-4 py-3 space-y-4">
          <EditableStringList
            label="除外責任" prefix="❌" accent="text-red-600"
            items={data.exclusions ?? []}
            onUpdate={(i, v) => updateListItem("exclusions", i, v)}
            onAdd={() => addListItem("exclusions")}
            onRemove={i => removeListItem("exclusions", i)}
          />
          <EditableStringList
            label="特殊限制" prefix="•" accent="text-indigo-700"
            items={data.specialRestrictions ?? []}
            onUpdate={(i, v) => updateListItem("specialRestrictions", i, v)}
            onAdd={() => addListItem("specialRestrictions")}
            onRemove={i => removeListItem("specialRestrictions", i)}
          />
        </div>
      </div>
    </div>
  );
}

function EditableStringList({
  label, prefix, accent, items, onUpdate, onAdd, onRemove,
}: {
  label: string; prefix: string; accent: string;
  items: string[];
  onUpdate: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-stone-400 mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {items.map((v, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className={`text-xs ${accent} mt-1.5 shrink-0`}>{prefix}</span>
            <textarea
              rows={1}
              value={v}
              onChange={e => onUpdate(i, e.target.value)}
              className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[#C8956C] text-stone-700"
            />
            <button onClick={() => onRemove(i)} className="text-stone-200 hover:text-red-400 transition-colors mt-1.5 shrink-0">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button onClick={onAdd} className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-[#C8956C] transition-colors">
          <Plus className="h-3 w-3" />
          新增{label}
        </button>
      </div>
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
  const [baseUnit, setBaseUnit] = useState("元");
  const [plans, setPlans] = useState<string[]>([]);
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

  // 公式 = 分析項目本身（items 自帶 valueSource）；不再依賴 products 表
  useEffect(() => {
    if (!analysisData) return;
    const items = analysisData.items ?? [];
    const cat = categoryOf(analysisData);
    if (analysisData.plans && analysisData.plans.length > 0) setPlans(analysisData.plans);
    if (analysisData.baseUnit) setBaseUnit(analysisData.baseUnit);
    setUnifiedItems(items.map(a => ({ ...a, ...suggestSource(a, cat) } as UnifiedItem)));
  }, [analysisData, product.planCode]);

  const handleSave = async () => {
    if (!analysisData) return;
    setSaving(true);
    setSaveResult(null);
    try {
      // 公式直接寫回 analysis items（含 value_source 結構），公式 = 分析項目本身
      const updatedData: AnalysisData = {
        ...analysisData,
        plans: plans.length > 0 ? plans : [],
        baseUnit,
        items: unifiedItems.map(it => ({
          name: it.name, formula: it.formula, unit: it.vUnit, restriction: it.restriction,
          notes: it.notes, pageRef: it.pageRef,
          valueSource: it.vSource,
          isLimit: it.vIsLimit || undefined,
          planValues: it.vSource === "plan" ? it.fPlanValues : undefined,
          tableRange: it.vSource === "table" ? { min: it.vTableMin ?? 0, max: it.vTableMax ?? 0 } : undefined,
          insuredRate: it.vSource === "insured" ? { type: it.vRateType ?? "multiplier", rate: it.vRate, min: it.vMinRate, max: it.vMaxRate } : undefined,
          amount: (it.vSource === "fixed" || it.vSource === "unit") ? it.vAmount : undefined,
          limit: it.fLimitDays ? { days: it.fLimitDays } : undefined,
        })),
      };

      // 只存 analysis JSON（公式已含在 items；不再依賴 products 表）
      const res = await fetch(`/api/review/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: updatedData }),
      });
      const result = await res.json();
      if (!result.success) {
        setSaveResult({ ok: false, msg: result.error ?? "儲存失敗" });
        return;
      }
      setFormulaVerified(true);
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

  // Cmd/Ctrl+S 儲存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
                plans={plans}
                productId={productId}
                formulaVerified={formulaVerified}
                onDataChange={d => { setAnalysisData(d); setIsDirty(true); }}
                onItemsChange={items => { setUnifiedItems(items); setIsDirty(true); }}
                onBaseUnitChange={u => { setBaseUnit(u); setIsDirty(true); }}
                onPlansChange={p => { setPlans(p); setIsDirty(true); }}
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
