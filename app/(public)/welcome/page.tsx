import Link from "next/link";
import { Foot } from "@/components/radia/Foot";

// 落地頁（原型 SCREENS.intro）。不寫「立即諮詢」——民眾最怕被業務纏上，第一句就把「要不要談你自己決定」講明。
const ENTRIES: [string, string, string][] = [
  ["i-doc", "看懂我手上的保單", "不知道保了什麼、夠不夠"],
  ["i-chart", "算算未來需要多少錢", "退休、小孩教育、怎麼分配"],
  ["i-chat", "我也還不確定", "聊聊再說"],
];

export default function WelcomePage() {
  return (
    <div className="cols"><div className="main">
      <svg className="ill hero" viewBox="0 0 220 180" aria-hidden="true"><use href="#i-radar" /></svg>
      <div className="eyebrow">免費 · 不用先留電話</div>
      <h2 className="t">保險這件事，<br />先弄懂再決定要不要買</h2>
      <p className="sub">花三分鐘跟我們聊聊你的狀況，你會知道自己現在缺什麼。要不要找顧問談，聊完你自己決定。</p>
      <div className="entries">
        {ENTRIES.map(([i, t, x]) => (
          <div key={t} className="entry">
            <svg className="ill i34" viewBox="0 0 48 48" aria-hidden="true"><use href={`#${i}`} /></svg>
            <div><div className="et">{t}</div><div className="ex">{x}</div></div>
          </div>
        ))}
      </div>
      <Foot><Link href="/welcome/consent" className="btn">開始聊聊</Link></Foot>
    </div></div>
  );
}
