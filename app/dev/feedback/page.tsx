import { notFound } from "next/navigation";
import { Shell } from "@/components/radia/Shell";
import { isDevSite } from "@/lib/devFeedback";
import { FeedbackList } from "@/components/dev/FeedbackList";

// 開發版回饋清單（卡 A 第 4 步）。上線版（RADIA_ENV≠dev）一律 404
export default function DevFeedbackPage() {
  if (!isDevSite()) notFound();
  return (
    <Shell chrome={<div className="chrome"><a className="brand" href="/" style={{ color: "inherit", textDecoration: "none" }}>RAD<i>IA</i></a><span className="rd-devtag">開發版</span></div>}>
      <div className="cols"><div className="main" style={{ maxWidth: 960 }}>
        <div className="eyebrow">開發版</div>
        <h2 className="t" style={{ marginBottom: 4 }}>回饋清單</h2>
        <p className="sub">每頁右下角「回饋」送進來的都在這裡。狀態由顧問或管理者更新；修好會改成「已修待複測」，請回原頁再看一次。</p>
        <FeedbackList />
      </div></div>
    </Shell>
  );
}
