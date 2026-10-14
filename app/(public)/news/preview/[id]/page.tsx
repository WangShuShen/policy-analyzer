import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { NewsError, previewDraft } from "@/lib/news/store";
import { ArticleView } from "@/components/news/NewsParts";

// 後台「先看公開版長怎樣」（W3）：編輯中的稿用公開頁的版型顯示。/news/ 底下是免登入路徑，所以這頁自己檢查管理者，不是就 404
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "預覽 · 保險快訊", robots: { index: false, follow: false } };

export default async function NewsPreview({ params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("auth_token")?.value;
  const s = token ? await verifyJWT(token) : null;
  if (!s || roleOf(s) !== "advisor" || !s.isAdmin) notFound();
  try {
    return <ArticleView a={await previewDraft((await params).id)} preview />;
  } catch (e) {
    if (e instanceof NewsError) notFound();
    throw e;
  }
}
