import Link from "next/link";
import { requireConsultPage } from "@/lib/consult/pageGate";
import { listAdvisorCards, activeBooking } from "@/lib/booking/service";
import { fmtTaipei } from "@/lib/booking/slots";
import { AdvisorPicker } from "@/components/public/AdvisorPicker";

// 選顧問（原型 SCREENS.advisors）。客戶完全自由選；順序每天輪替，不依成交量或佣金（N14 精神）
export default async function AdvisorsPage() {
  const { userId } = await requireConsultPage();
  const [cards, active] = await Promise.all([listAdvisorCards(), activeBooking(userId)]);
  return (
    <div className="cols"><div className="main">
      <h2 className="t">想找誰聊？</h2>
      <p className="sub">都可以，挑一個你覺得順眼的就好。<b>你在對話裡講過的狀況會一起帶給他</b>，不用重講。</p>
      {active ? (
        <div className="statusline" style={{ marginTop: 16 }}><span className="dotp" />
          <span>你已經約了 <b>{active.advisorName}</b> 顧問，<b>{fmtTaipei(active.starts_at)}</b>。<Link href="/me" style={{ color: "var(--brand-ink)", marginLeft: 6 }}>看預約與進度</Link></span></div>
      ) : cards.length === 0 ? (
        <div className="anzempty" style={{ marginTop: 16 }}><div className="aet">目前沒有開放預約的顧問</div><p>晚一點再來看看。</p></div>
      ) : <AdvisorPicker cards={cards} />}
      <p className="dinn" style={{ textAlign: "left", marginTop: 14 }}>顧問順序每天輪替，不依成交量或佣金排序。</p>
    </div></div>
  );
}
