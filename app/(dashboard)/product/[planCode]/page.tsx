"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ProductDetail from "@/components/ProductDetail";

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params?.planCode;
  const planCode = decodeURIComponent(Array.isArray(raw) ? raw[0] : (raw ?? ""));

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#FDFAF6]/90 backdrop-blur border-b border-[#EDE0CE] px-4 sm:px-6 py-3">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-[#8B5E3C] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          返回商品查詢
        </button>
      </div>
      <ProductDetail planCode={planCode} />
    </div>
  );
}
