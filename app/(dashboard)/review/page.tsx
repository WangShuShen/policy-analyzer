"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ClipboardCheck } from "lucide-react";
import { ReviewQueue, type ReviewProduct } from "@/components/ReviewView";

export default function ReviewPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(() => {
    setLoading(true);
    fetch("/api/review")
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
    window.addEventListener("review-archived", loadProducts);
    return () => window.removeEventListener("review-archived", loadProducts);
  }, [loadProducts]);

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          保單審核
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">逐一審核 AI 分析結果，確認後歸檔</p>
      </div>

      <div className="w-full px-8 py-6 space-y-4 overflow-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">載入待審核清單…</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#C8956C]" />
              <span className="text-sm font-medium text-stone-600">待審核：{products.length} 筆</span>
            </div>
            <ReviewQueue
              products={products}
              onSelect={(p) => router.push(`/review/${encodeURIComponent(p.id)}`)}
            />
          </>
        )}
      </div>
    </>
  );
}
