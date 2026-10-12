import Link from "next/link";

/*
 * 頁尾（設計準則「頁尾：每一頁都要有」2026-10-11）：內容的終點，跟著內容捲到最後。
 * 跟底部動作列（.foot）是兩件事——動作列有按鈕才出現，頁尾每頁都有。
 */
export function SiteFoot() {
  return (
    <footer className="rd-sitefoot">
      <div className="inner">
        <div><b>RADIA</b>　保險這件事，先弄懂再決定</div>
        <div>試算與分析僅供參考，實際給付以保單條款為準。</div>
        <div><Link href="/welcome/consent">個資告知與同意</Link>　·　© {new Date().getFullYear()} RADIA</div>
      </div>
    </footer>
  );
}
