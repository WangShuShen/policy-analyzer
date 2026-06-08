"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ReviewDetail, type ReviewProduct } from "@/components/ReviewView";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ReviewProduct | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/review?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setProduct(d);
      })
      .catch(e => setError(String(e)));
  }, [id]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={() => router.push("/review")} className="text-xs text-[#C8956C] hover:underline">
          返回審核清單
        </button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">載入中…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <ReviewDetail
        product={product}
        onBack={() => router.push("/review")}
        onArchived={() => router.push("/review")}
      />
    </div>
  );
}
