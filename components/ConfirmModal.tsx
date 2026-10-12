"use client";

import { AlertCircle, Loader2 } from "lucide-react";

// RADIA 風格的確認對話框，取代瀏覽器原生 confirm()
export function ConfirmModal({
  open,
  title,
  message,
  confirmText = "確定",
  cancelText = "取消",
  tone = "brand",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "brand" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-[#DFE4E1] w-full max-w-sm overflow-hidden animate-[fadeIn_120ms_ease-out]">
        <div className="px-6 pt-6 pb-2 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-[#E2EFEB] flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-[#2F7A6B]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-stone-800">{title}</h3>
            {message && <p className="text-sm text-stone-500 mt-1.5 whitespace-pre-wrap leading-relaxed">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm text-stone-500 border border-[#DFE4E1] bg-white hover:bg-stone-50 disabled:opacity-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all shadow-sm"
            style={{ background: tone === "danger" ? "linear-gradient(135deg, #f87171, #dc2626)" : "#2F7A6B" }}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
