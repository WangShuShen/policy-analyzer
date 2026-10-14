import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT, roleOf } from "@/lib/jwt";
import { hasAnyRequiredConsent, hasRequiredConsent } from "@/lib/consents";
import { getConversation, getFacts, getMessages, listConversations } from "@/lib/consult/store";
import { buildAnalysis, publicView } from "@/lib/consult/analysis";
import { view as passbookView } from "@/lib/passbook/service";
import { AnalysisPanels } from "@/components/public/AnalysisPanels";
import { STEPS } from "@/lib/consult/script";
import { ViewTracker } from "@/components/public/ViewTracker";

/*
 * 我的分析（4-ag）：對話是「過程」，這頁是「結果」——同一份資料、兩個入口。
 * 使用者回來多半是想再看一次數字，不是想重讀整段對話。
 * 排法跟對話不一樣：事實在上、判讀與建議在下；未面談時判讀鎖住（4-ah）。
 */
export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const token = (await cookies()).get("auth_token")?.value;
  const session = token ? await verifyJWT(token) : null;
  if (!session) redirect("/welcome/consent");
  if (roleOf(session) !== "customer") redirect("/");
  if (!(await hasRequiredConsent(session.advisorId))) {
    redirect((await hasAnyRequiredConsent(session.advisorId)) ? "/welcome/consent?error=consent_outdated" : "/welcome/consent");
  }
  const userId = session.advisorId;
  const { id } = await searchParams;

  // 有算出東西的對話才列；沒指定就看最近一段
  const convs = await listConversations(userId);
  const withPanels: { id: string; title: string; status: string; date: string; shown: string[] }[] = [];
  for (const c of convs) {
    const msgs = await getMessages(c.id);
    const shown = msgs.flatMap(m => m.content.kind === "panel" ? [m.content.key] : []);
    if (shown.length) withPanels.push({ id: c.id, title: c.title ?? "這次的對話", status: c.status, date: c.last_active_at.slice(0, 10), shown });
  }
  const cur = (id && withPanels.find(c => c.id === id)) || withPanels[0];

  if (!cur) {
    return (
      <div className="cols"><div className="main">
        <div className="anzhd"><div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">我的分析</div>
          <h2 className="t" style={{ marginBottom: 4 }}>你的狀況，我整理在這裡</h2>
        </div></div>
        <div className="anzempty"><div className="aet">還沒有分析</div>
          <p>先去跟 AI 聊聊你的狀況——<b>聊到哪、這裡就整理到哪</b>，不用一次聊完。</p>
          <div className="ccacts"><Link className="ccbtn pri" href="/consult">去諮詢</Link></div></div>
      </div></div>
    );
  }

  const conv = (await getConversation(userId, cur.id))!;
  const facts = await getFacts(conv.id);
  const { stuck: _stuck, ...pb } = await passbookView(userId);
  const a = publicView(await buildAnalysis(userId, facts, cur.shown, true, pb));
  const badge = a.unlocked ? "已面談 · 完整內容已解鎖" : a.booking?.status === "booked" ? "已預約 · 面談後解鎖" : "判讀與建議待面談";
  const n = pb.counts.total - pb.counts.removed - pb.counts.others;

  return (
    <div className="cols"><div className="main">
      <div className="anzhd"><div style={{ flex: 1, minWidth: 0 }}>
        <div className="eyebrow">我的分析</div>
        <h2 className="t" style={{ marginBottom: 4 }}>你的狀況，我整理在這裡</h2>
        <p className="sub">從你跟 AI 的對話算出來的。<b>隨時回來看，不用捲回對話裡找。</b></p></div>
        <span className={`ccst ${a.unlocked ? "" : "pros"}`}>{badge}</span></div>

      {withPanels.length > 1 && (
        <div className="ccacts" aria-label="選擇對話">
          {withPanels.map(c => <Link key={c.id} href={`/analysis?id=${c.id}`} className={`ccbtn ${c.id === cur.id ? "pri" : ""}`}>{c.title} · {c.date}</Link>)}
        </div>
      )}

      <div className="anzsrc"><span>整理自 <b>{cur.date} 的對話</b> · {facts.length} 項狀況{pb.upload?.status === "done" ? ` · 保險存摺 ${n} 張` : <> · <span style={{ color: "var(--amber)" }}>還沒有你的保單</span></>}
        {conv.status !== "done" && <> · <span style={{ color: "var(--amber)" }}>還沒聊完</span></>}</span>
        <Link className="cvb" href={`/consult?id=${conv.id}`}>{conv.status !== "done" ? "回去接著聊" : "回到對話"}</Link></div>

      <div className="anzbody">
        {facts.length > 0 && (
          <div className="dpan"><div className="dph"><span className="dpt">你說的事</span><span className="dpn">{facts.length} 項</span></div>
            <div className="ndl">{facts.map(f => <div key={f.key} className="ndi"><span className="ndk">{labelOf(f.key)}</span><span className="ndv">{f.display}</span></div>)}</div></div>
        )}
        <AnalysisPanels a={a} />
      </div>
      <ViewTracker page="analysis" refId={cur.id} selector=".anzbody .dpan" labelSelector=".dpt" />{/* W2 w2-04：顧問看得到「看過幾次、在哪段停最久」 */}
      <p className="dinn" style={{ textAlign: "left" }}>數字依財政部、勞動部公告參數（版本 {a.assumptionsVersion}）計算，<b>沒有假設任何投資報酬率</b>。</p>
    </div></div>
  );
}

const labelOf = (key: string) => {
  for (const s of STEPS) if (s.t === "ask" && s.keys.includes(key)) return s.o.find(o => o.key === key)?.label ?? key;
  return key;
};
