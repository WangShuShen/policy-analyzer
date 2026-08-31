"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { ACTION_LABELS, PLANS, type Action, type PlanId } from "@/lib/plans";

const SHOWCASE: PlanId[] = ["free", "basic", "pro"];

function priceLabel(plan: (typeof PLANS)[PlanId]) {
  if (plan.monthlyPrice === 0) return "免費";
  return `NT$${plan.monthlyPrice.toLocaleString()}`;
}

function PricingContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const action = searchParams.get("action") as Action | null;

  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCurrentPlan(d?.internal ? null : (d?.plan ?? null)))
      .catch(() => setCurrentPlan(null))
      .finally(() => setLoading(false));
  }, []);

  const actionLabel = action && ACTION_LABELS[action] ? ACTION_LABELS[action] : null;

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        {reason && (
          <div className="mb-8 rounded-xl border border-[#E8D5B7] bg-[#FBF0E3] px-5 py-4">
            <p className="text-sm font-medium text-[#8B5E3C]">
              {reason === "plan_required"
                ? `「${actionLabel ?? "此功能"}」需要升級方案才能使用`
                : `本月「${actionLabel ?? "此功能"}」的免費額度已用完`}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              升級後即可繼續使用，額度每月 1 日自動重置。
            </p>
          </div>
        )}

        <header className="text-center">
          <h1 className="text-2xl font-semibold text-stone-800 sm:text-3xl">選擇你的方案</h1>
          <p className="mt-3 text-sm text-stone-600 sm:text-base">
            別人靠話術，我們靠看得懂條款的 AI —— 算得出實際理賠金額的保單分析工具。
          </p>
        </header>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {SHOWCASE.map(id => {
            const plan = PLANS[id];
            const isCurrent = currentPlan === id;
            const featured = id === "basic";
            return (
              <section
                key={id}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                  featured ? "border-[#C8956C] shadow-sm" : "border-[#EDE0CE]"
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#8B5E3C] px-3 py-1 text-xs font-medium text-white">
                    最多人選擇
                  </span>
                )}

                <h2 className="text-lg font-semibold text-stone-800">{plan.name}</h2>

                <p className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-stone-900">{priceLabel(plan)}</span>
                  {plan.monthlyPrice > 0 && <span className="text-sm text-stone-500">/ 月</span>}
                </p>
                {plan.yearlyPrice && (
                  <p className="mt-1 text-xs text-stone-500">
                    年繳 NT${plan.yearlyPrice.toLocaleString()}（送 2 個月）
                  </p>
                )}

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.highlights.map(item => (
                    <li key={item} className="flex gap-2 text-sm text-stone-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C8956C]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {loading ? (
                    <div className="flex h-10 items-center justify-center rounded-lg bg-[#F5EDE0]">
                      <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                    </div>
                  ) : isCurrent ? (
                    <div className="flex h-10 items-center justify-center rounded-lg bg-[#F5EDE0] text-sm text-stone-500">
                      目前方案
                    </div>
                  ) : plan.monthlyPrice === 0 ? (
                    <Link
                      href="/catalog"
                      className="flex h-10 items-center justify-center rounded-lg border border-[#EDE0CE] text-sm text-stone-700 transition-colors hover:bg-[#FEF9F2]"
                    >
                      開始使用
                    </Link>
                  ) : (
                    // 金流串接為 W3 範圍，先導向聯繫方式，避免出現點了沒反應的按鈕。
                    <a
                      href="mailto:woody38921218@gmail.com?subject=RADIA 訂閱洽詢"
                      className="flex h-10 items-center justify-center rounded-lg bg-[#8B5E3C] text-sm font-medium text-white transition-colors hover:bg-[#7A5133]"
                    >
                      聯繫開通
                    </a>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-stone-500">
          門徒方案由管理者開通，不對外販售。線上刷卡訂閱即將開放。
        </p>

        <div className="mt-10 text-center">
          <Link href="/catalog" className="text-sm text-[#8B5E3C] hover:underline">
            返回商品查詢
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FDFAF6]">
          <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
