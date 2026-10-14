/**
 * 客服信箱（同意書第六條「或來信客服信箱」；顧問 10/14：另開信箱，放頁尾與「我的資料」頁，同意書文字不改）。
 * 從環境變數 NEXT_PUBLIC_SUPPORT_EMAIL 讀：頁尾也會在瀏覽器端畫（登入頁、顧問申請頁是 client 頁），
 * 只有 NEXT_PUBLIC_ 開頭的變數兩邊讀得到、才不會伺服器和瀏覽器畫得不一樣。信箱本來就要公開，不是祕密。
 * ⚠️ NEXT_PUBLIC_ 是打包時寫進去的：在 Vercel 設好或改掉之後要重新部署才生效。
 * 還沒設定或格式不對就回 null，頁面整段不顯示（不要出現壞掉的連結）。
 */
export function supportEmail(): string | null {
  const v = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return v && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v) ? v : null;
}
