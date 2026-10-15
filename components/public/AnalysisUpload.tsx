"use client";

import { useRouter } from "next/navigation";
import { PassbookUpload } from "./PassbookUpload";

/** 我的分析的上傳區塊（4-at）：跳過上傳的人、財務路線的人都從這裡傳；傳完留在這頁，讀取進度與確認清單接著出現 */
export function AnalysisUpload({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  return <PassbookUpload conversationId={conversationId} onUploaded={() => { window.dispatchEvent(new Event("passbook:changed")); router.refresh(); }} />;
}
