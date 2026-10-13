import { RadiaIcons } from "./RadiaIcons";
import { SiteFoot } from "./SiteFoot";
import { DevFeedback } from "./DevFeedback";
import "@/app/gensen.css";
import "@/app/radia.css";
import "@/app/radia-extra.css";

/*
 * RADIA 外框（原型 .viewport）：頂部列（chrome）＋可捲動的內容（body > pad）＋底部動作列（foot）。
 * 客戶端與顧問端共用同一個外框——同一個品牌。頁尾（SiteFoot）每頁都有，接在內容最後面。
 * 樣式全部來自 app/radia.css（自動搬自原型），這裡不寫任何自己的樣式。
 */
export function Shell({ chrome, children }: { chrome: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rd">
      <RadiaIcons />
      {chrome}
      <div className="body"><div className="pad">{children}</div><SiteFoot /></div>
      <div className="foot"><div className="inner" id="rd-foot" /></div>
      <DevFeedback />{/* 只在開發版出現（RADIA_ENV=dev），上線版不渲染 */}
    </div>
  );
}
