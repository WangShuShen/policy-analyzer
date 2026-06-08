"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ClockIcon, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then(r => r.json())
      .then(d => setHistory(d.analyses ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleClick = (h: HistoryItem) => {
    sessionStorage.setItem(
      "analyze_prefill",
      JSON.stringify({ data: JSON.parse(h.analysis_json), pid: h.product_id })
    );
    router.push("/analyze");
  };

  return (
    <>
      <div className="bg-white border-b border-[#EDE0CE] px-8 py-4 shadow-sm shrink-0">
        <h2 className="text-lg font-bold text-stone-800" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
          歷史紀錄
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">過去的分析結果，點擊可重新查看</p>
      </div>

      <div className="w-full px-8 py-6 overflow-auto flex-1">
        <Card className="bg-white border-[#EDE0CE] shadow-sm rounded-2xl">
          <CardContent className="px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-stone-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">載入中…</span>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="h-10 w-10 text-stone-200 mx-auto mb-3" />
                <p className="text-sm text-stone-400">尚無分析紀錄</p>
                <button
                  onClick={() => router.push("/analyze")}
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
                    onClick={() => handleClick(h)}
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
      </div>
    </>
  );
}
