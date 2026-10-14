"use client";

/*
 * 諮詢紀錄防外流（N8、w2-07）：可以查，不能匯出。做到「合理程度」：
 *   不能選取／複製／剪下、右鍵選單關掉、列印只印出一行說明、淡色浮水印標上查看的顧問與時間（截圖也帶得到是誰看的）。
 * 擋不了截圖、拍照或開發者工具——真正的保護是「誰在何時看了」都留稽核（W1 已有）。
 */
export function NoCopy({ who, at, children }: { who: string; at: string; children: React.ReactNode }) {
  const label = `${who} 查看 ${at}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='260' height='120'><text x='10' y='70' transform='rotate(-18 130 60)' font-size='13' fill='rgba(120,130,128,0.16)' font-family='sans-serif'>${label.replace(/[<>&'"]/g, "")}</text></svg>`;
  const stop = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div className="crm-nocopy" onCopy={stop} onCut={stop} onContextMenu={stop} onDragStart={stop}
      style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} data-print-note="諮詢紀錄不提供列印（N8：可查不可匯出）">
      {children}
    </div>
  );
}
