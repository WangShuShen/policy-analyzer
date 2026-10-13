// 開發版模擬 AI 模式（lib/consult/mock.ts）開著時，諮詢頁上方的提示。伺服器端直接畫，不等對話載入
export function MockBanner() {
  return (
    <div role="note" style={{ fontFamily: "var(--ui)", fontSize: 12, color: "var(--amber)", background: "var(--amber-soft)",
      borderRadius: 8, padding: "5px 11px", margin: "0 auto 12px", width: "fit-content" }}>
      開發版：AI 為模擬回覆
    </div>
  );
}
