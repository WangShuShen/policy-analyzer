"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { ReviewQueue, type ReviewProduct } from "@/components/ReviewView";

interface MyProgress {
  total: number;
  completed: number;
  pending: number;
  advisorName: string;
  date: string;
}

export default function ReviewPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/review").then(r => r.json()),
      fetch("/api/my-progress").then(r => r.json()),
      fetch("/api/auth/me").then(r => r.json()),
    ]).then(([review, prog, me]) => {
      setProducts(review.products ?? []);
      setProgress(prog);
      setIsAdmin(me.isAdmin ?? false);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener("review-archived", loadData);
    return () => window.removeEventListener("review-archived", loadData);
  }, [loadData]);

  const pct = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
              保單審核
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {isAdmin ? "管理者模式 — 顯示全部待審核保單" : "逐一審核 AI 分析結果，確認後歸檔"}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/progress")}
              className="text-xs text-[#C8956C] border border-[#EDE0CE] px-3 py-1.5 rounded-lg hover:bg-[#FBF0E3] transition-colors"
            >
              查看全員進度 →
            </button>
          )}
        </div>
      </div>

      <div className="w-full px-8 py-6 space-y-4 overflow-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">載入待審核清單…</span>
          </div>
        ) : (
          <>
            {/* Progress card — only for non-admin with assignments */}
            {!isAdmin && progress && progress.total > 0 && (
              <div className="bg-white border border-[#EDE0CE] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-700">今日審核進度</p>
                    <p className="text-xs text-stone-400 mt-0.5">{progress.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: pct === 100 ? "#10B981" : "#C8956C" }}>
                      {progress.completed}
                      <span className="text-base font-normal text-stone-400"> / {progress.total}</span>
                    </p>
                    <p className="text-xs text-stone-400">份完成</p>
                  </div>
                </div>
                <div className="h-2 bg-[#F5EDE0] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100
                        ? "linear-gradient(90deg,#34D399,#10B981)"
                        : "linear-gradient(90deg,#C8956C,#A0714F)",
                    }}
                  />
                </div>
                {pct === 100 && (
                  <div className="flex items-center gap-1.5 mt-3 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">今日審核全部完成！</span>
                  </div>
                )}
              </div>
            )}

            {/* Queue header */}
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#C8956C]" />
              <span className="text-sm font-medium text-stone-600">
                {isAdmin ? `待審核：${products.length} 筆（全部）` : `今日待審核：${products.length} 份`}
              </span>
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
