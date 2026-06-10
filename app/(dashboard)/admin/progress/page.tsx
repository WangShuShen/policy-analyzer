"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, TrendingUp, CheckCircle2 } from "lucide-react";

interface AdvisorProgress {
  id: string;
  name: string;
  email: string;
  is_admin: number;
  total: number;
  completed: number;
  pending: number;
}

interface ProgressData {
  date: string;
  advisors: AdvisorProgress[];
}

export default function AdminProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    fetch("/api/admin/progress")
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const overallTotal = data?.advisors.reduce((s, a) => s + a.total, 0) ?? 0;
  const overallDone = data?.advisors.reduce((s, a) => s + a.completed, 0) ?? 0;
  const overallPct = overallTotal > 0 ? Math.round(overallDone / overallTotal * 100) : 0;

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
              今日審核進度
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {data?.date ?? "—"} · 全員審核狀況總覽
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-[#C8956C] border border-[#EDE0CE] px-3 py-1.5 rounded-lg hover:bg-[#FBF0E3] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            重新整理
          </button>
        </div>
      </div>

      <div className="w-full px-8 py-6 space-y-5 overflow-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">載入進度資料…</span>
          </div>
        ) : !data ? (
          <p className="text-sm text-stone-400 text-center py-20">無法載入資料</p>
        ) : (
          <>
            {/* Overall summary card */}
            <div className="bg-white border border-[#EDE0CE] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[#C8956C]" />
                <span className="text-sm font-semibold text-stone-700">整體進度</span>
                <span className="ml-auto text-2xl font-bold" style={{ color: overallPct === 100 ? "#10B981" : "#C8956C" }}>
                  {overallDone}
                  <span className="text-base font-normal text-stone-400"> / {overallTotal}</span>
                </span>
              </div>
              <div className="h-2.5 bg-[#F5EDE0] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${overallPct}%`,
                    background: overallPct === 100
                      ? "linear-gradient(90deg,#34D399,#10B981)"
                      : "linear-gradient(90deg,#C8956C,#A0714F)",
                  }}
                />
              </div>
              <p className="text-xs text-stone-400 mt-2 text-right">{overallPct}% 完成</p>
            </div>

            {/* Per-advisor table */}
            <div className="bg-white border border-[#EDE0CE] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#EDE0CE] bg-[#FBF0E3]/50">
                <span className="text-sm font-semibold text-stone-600">顧問個人進度</span>
                <span className="text-xs text-stone-400 ml-2">{data.advisors.length} 位顧問</span>
              </div>
              <div className="divide-y divide-[#F5EDE0]">
                {data.advisors.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-10">今日尚無分配</p>
                ) : (
                  data.advisors.map(a => {
                    const pct = a.total > 0 ? Math.round(a.completed / a.total * 100) : 0;
                    const done = pct === 100 && a.total > 0;
                    return (
                      <div key={a.id} className="px-5 py-4 flex items-center gap-4">
                        {/* Name / email */}
                        <div className="w-40 shrink-0">
                          <p className="text-sm font-semibold text-stone-800 truncate">{a.name}</p>
                          <p className="text-xs text-stone-400 truncate">{a.email}</p>
                          {a.is_admin === 1 && (
                            <span className="text-[10px] font-bold text-[#C8956C] bg-[#FBF0E3] px-1.5 py-0.5 rounded-full">
                              管理員
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="flex-1">
                          {a.total === 0 ? (
                            <p className="text-xs text-stone-300">今日無分配</p>
                          ) : (
                            <>
                              <div className="h-2 bg-[#F5EDE0] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background: done
                                      ? "linear-gradient(90deg,#34D399,#10B981)"
                                      : "linear-gradient(90deg,#C8956C,#A0714F)",
                                  }}
                                />
                              </div>
                              <p className="text-xs text-stone-400 mt-1">{pct}%</p>
                            </>
                          )}
                        </div>

                        {/* Count */}
                        <div className="text-right shrink-0 w-20">
                          {a.total === 0 ? (
                            <span className="text-xs text-stone-300">—</span>
                          ) : done ? (
                            <span className="flex items-center justify-end gap-1 text-emerald-600 text-sm font-bold">
                              <CheckCircle2 className="h-4 w-4" /> 完成
                            </span>
                          ) : (
                            <>
                              <p className="text-base font-bold text-[#C8956C]">
                                {a.completed}
                                <span className="text-sm font-normal text-stone-400"> / {a.total}</span>
                              </p>
                              <p className="text-xs text-amber-500">{a.pending} 待完成</p>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
