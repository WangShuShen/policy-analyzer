/*
 * AI 與腳本的訊息會帶 <b>／<br>。AI 的輸出可能被使用者的輸入影響（例如他打了 <script>），
 * 所以顯示前一律先跳脫，只放回粗體與換行兩種標記。
 */
export function safeHtml(html: string): string {
  const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return escaped
    .replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")
    .replace(/&lt;br\s*\/?&gt;/g, "<br>");
}
