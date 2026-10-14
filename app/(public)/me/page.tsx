import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import db from "@/lib/db";
import { bookings, conversations, advisors } from "@/lib/schema";
import { requireConsultPage } from "@/lib/consult/pageGate";
import { getFacts } from "@/lib/consult/store";
import { view as passbookView } from "@/lib/passbook/service";
import { fmtTaipei } from "@/lib/booking/slots";
import { MeBookingActions } from "@/components/public/MeBookingActions";
import { MyData } from "@/components/public/MyData";
import { supportEmail } from "@/lib/support";

/*
 * 我的頁面（原型 SCREENS.me）：客戶端唯一的家。分頁：預約與進度｜我的規劃｜我的保單｜我的顧問｜我的資料（4-ap：同意書第六條寫的入口）。
 * W1a 都是準客戶（還沒有「成交」狀態）；規劃書由顧問送出是 W4，這裡先放鎖住／面談時打開的狀態。
 */
const METABS = [["book", "預約與進度"], ["plan", "我的規劃"], ["pol", "我的保單"], ["adv", "我的顧問"], ["data", "我的資料"]] as const;
const parseSpecs = (s: string | null) => { try { const a = JSON.parse(s ?? "[]"); return Array.isArray(a) ? a as string[] : []; } catch { return []; } };

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string; booked?: string; rescheduled?: string; cancelled?: string }> }) {
  const { userId, name } = await requireConsultPage();
  const { tab = "book", booked, rescheduled, cancelled } = await searchParams;

  const [bRow] = await db.select({ b: bookings, a: advisors }).from(bookings).innerJoin(advisors, eq(advisors.id, bookings.advisor_id))
    .where(eq(bookings.user_id, userId)).orderBy(desc(bookings.created_at)).limit(1);
  const b = bRow && ["booked", "met"].includes(bRow.b.status) ? bRow : null;
  const advCancelled = bRow?.b.status === "cancelled_by_advisor" ? bRow : null;   // 顧問取消：告訴客戶原因
  const adv = b?.a ?? null;
  const advSp = adv ? parseSpecs(adv.specialties).join("、") : "";
  const [conv] = await db.select().from(conversations).where(eq(conversations.user_id, userId)).orderBy(desc(conversations.last_active_at)).limit(1);
  const facts = conv ? await getFacts(conv.id) : [];
  const { stuck: _s, ...pb } = await passbookView(userId);
  const pbDone = pb.upload?.status === "done";
  const n = pb.counts.total - pb.counts.removed - pb.counts.others;
  const when = b ? fmtTaipei(b.b.starts_at) : null;
  const met = b?.b.status === "met";

  const title = !b ? `${name}，還沒約顧問` : met ? `${name}，你跟 ${adv!.name} 顧問談過了` : `${name}，你約好 ${when} 的諮詢了`;

  return (
    <div className="cols"><div className="main">
      <div className="cch">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">我的頁面</div>
          <h2 className="t" style={{ marginBottom: 4 }}>{title}</h2>
        </div>
        <span className="ccst pros">準客戶 · 尚未成交</span>
      </div>
      <div className="actabs" style={{ marginTop: 14 }}>
        {METABS.map(([k, t]) => <Link key={k} href={`/me?tab=${k}`} className={`actb ${tab === k ? "on" : ""}`} style={{ textDecoration: "none" }}>{t}</Link>)}
      </div>

      {tab === "book" && (
        <div className="ccg">
          {(booked || rescheduled) && b && !met && <div className="ccc wide" style={{ background: "var(--brand-soft)", borderColor: "transparent" }}><div className="ccb">{rescheduled ? "時間改好了" : "約好了"}</div><div className="ccd">{rescheduled ? `新的確認信寄到你的信箱了，附件會更新你的行事曆。已經通知 ${adv!.name} 顧問。` : `確認信寄到你的信箱了，附件可以加入行事曆。${adv!.name} 顧問會在時間前跟你確認。`}</div></div>}
          {cancelled && !b && <div className="ccc wide" style={{ background: "var(--sunk)", borderColor: "transparent" }}><div className="ccb">已經取消了</div><div className="ccd">也通知顧問了。你的資料都還在，之後想談再約就好。</div></div>}
          {advCancelled && !b && <div className="ccc wide" style={{ background: "var(--must-soft)", borderColor: "transparent" }}><div className="ccb">{advCancelled.a.name} 顧問取消了 {fmtTaipei(advCancelled.b.starts_at)} 的面談</div><div className="ccd">原因：{advCancelled.b.cancel_reason}<br />很抱歉臨時取消。重新挑一個時間或另一位顧問，前面講過的狀況會一起帶過去。</div></div>}
          {b ? (
            <div className="ccc wide lead">
              <div className="cct">{met ? "已面談" : "下一步"}</div>
              <div className="ccb">{when}　{b.b.mode === "online" ? "線上視訊" : "面對面"}</div>
              <div className="ccd">{adv!.name} 顧問{advSp && ` · 擅長${advSp}`}<br />{met ? "談完的內容已經解鎖在「我的分析」，之後隨時回來看。" : <>最長約 2 小時，他會在前一天跟你確認。{b.b.mode === "online" && adv!.meeting_link && <><br />會議連結：<a href={adv!.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-ink)" }}>{adv!.meeting_link}</a></>}{b.b.mode === "onsite" && adv!.onsite_location && <><br />地點：{adv!.onsite_location}</>}</>}</div>
              {!met && <div className="ccacts"><a className="ccbtn" href={`/api/bookings/${b.b.id}/ics`}>加入行事曆</a></div>}
              {!met && <MeBookingActions bookingId={b.b.id} advisorId={adv!.id} startsAt={b.b.starts_at} advisorName={adv!.name} />}
            </div>
          ) : (
            <div className="ccc wide lead">
              <div className="cct">下一步</div>
              <div className="ccb">找一位顧問聊聊</div>
              <div className="ccd">你在對話裡講過的狀況會一起帶給他，不用重講。不想談也沒關係。</div>
              <div className="ccacts"><Link className="ccbtn pri" href="/advisors">去挑顧問</Link></div>
            </div>
          )}
          <div className="ccc wide">
            <div className="cct">面談前要做的</div>
            <div className="ccpl">
              <div className="ccpr"><div><b>{pbDone ? "✅ 已上傳保險存摺" : "⬜ 上傳保險存摺"}</b><span className="ccpn">{pbDone ? `${pb.upload!.createdAt.slice(0, 10)} 上傳 · ${n} 張整理完成` : "有你的保單，顧問才做得出專屬你的分析"}</span></div>
                <Link className="ccbtn" style={{ padding: "5px 10px", minHeight: 0 }} href={pbDone ? "/me?tab=pol" : conv ? `/consult?id=${conv.id}` : "/consult"}>{pbDone ? "看結果" : "去上傳"}</Link></div>
              <div className="ccpr"><div><b>{facts.length ? `✅ 已聊出 ${facts.length} 項狀況` : "⬜ 跟 AI 聊聊你的狀況"}</b><span className="ccpn">{conv?.status === "done" ? "都聊完了，顧問拿到的是完整的一份" : facts.length ? "聊到一半也沒關係，顧問會接著問剩下的" : "聊到哪、整理到哪"}</span></div>
                <Link className="ccbtn" style={{ padding: "5px 10px", minHeight: 0 }} href={facts.length ? "/analysis" : "/consult"}>{facts.length ? "看我的分析" : "去聊聊"}</Link></div>
            </div>
            <div className="ccd">{pbDone && facts.length ? "都準備好了，面談當天直接開始談就可以。" : "面談前完成就好，不用一次做完。"}</div>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div style={{ marginTop: 16 }}>
          <div className="planhd"><div className="ph">
            <div className="eyebrow">我的規劃</div>
            <h2 className="t" style={{ marginBottom: 6 }}>補強前後，差在哪</h2>
            <p className="sub">顧問看過你的保單之後會幫你算出來。</p></div></div>
          {!b ? (
            <div className="gate">
              <svg className="ill i56" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-lock" /></svg>
              <div className="gt">要有你的保單才算得出來</div>
              <div className="gd">補強前後的對照需要知道你現在有什麼。<br />約好時間、上傳保險存摺，顧問確認完就會送給你。</div>
            </div>
          ) : (
            <>
              <div className="statusline"><span className="dotp" /><span>{met ? <>已在 <strong>{when}</strong> 面談</> : <>已預約 <strong>{when}</strong>，{adv!.name} 顧問會先看過你的資料</>}</span></div>
              <div className="gate">
                <svg className="ill i56" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-doc" /></svg>
                <div className="gt">{met ? "顧問正在準備規劃書" : "面談時一起打開"}</div>
                <div className="gd">{met ? <>{adv!.name} 顧問送出後就會出現在這裡。<br />保額和商品要由他當面說明。</> : <>顧問正在看你的保單、準備規劃書。<br /><b>面談時他會跟你一起看</b>——保額和商品要由他當面說明，談完就一直留在這裡。</>}</div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "pol" && (
        <div className="ccg">
          <div className="ccc wide">
            <div className="cct">你給我們的保單</div>
            {!pb.upload ? <div className="ccd">還沒上傳。<Link href={conv ? `/consult?id=${conv.id}` : "/consult"} style={{ color: "var(--brand-ink)" }}>去上傳保險存摺</Link></div> : (
              <>
                <div className="ccpl">{pb.policies.filter(p => p.matchStatus !== "removed").map(p => (
                  <div key={p.id} className="ccpr"><div><b>{p.productName}</b><span className="ccpn">{[p.amountText, p.effectiveDate && `${p.effectiveDate} 生效`, p.forOther && `被保險人：${p.forOther}`, p.matchStatus === "ai_read" ? "AI 初步讀取" : p.matchStatus === "pending" ? "還在確認" : null].filter(Boolean).join(" · ")}</span></div></div>
                ))}</div>
                <div className="ccd">{pb.upload.createdAt.slice(0, 10)} 上傳保險存摺{pbDone && `，${n} 張整理完成`}。{adv ? `${adv.name} 顧問面談前會先看過，你不用再傳一次。` : "約顧問之後，他面談前會先看過。"}</div>
                <div className="ccacts"><Link className="ccbtn" href="/analysis">看全險圖</Link></div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "adv" && (
        <div className="ccg">
          <div className="ccc wide">
            <div className="cct">跟我談的人</div>
            {adv ? (
              <>
                <div className="ccadv">
                  <div className="ccav">{adv.name.slice(0, 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ccb">{adv.name}</div>
                    <div className="ccn2">登錄字號 {adv.license_no ?? "—"}{advSp && `　·　擅長${advSp}`}</div>
                  </div>
                </div>
                <div className="ccsafe">他現在是<b>跟你諮詢的顧問</b>，還不是你的服務業務員。<br />談完你覺得不合適，可以直接換人或就此打住——<b>不會有人一直打給你</b>。</div>
              </>
            ) : <div className="ccd">還沒有。<Link href="/advisors" style={{ color: "var(--brand-ink)" }}>去挑一位顧問</Link></div>}
          </div>
        </div>
      )}

      {tab === "data" && <MyData supportEmail={supportEmail()} />}

      <div className="ccsoon">
        <div className="cct">之後會有（還沒做）</div>
        <div className="ccsl">
          {[["線上理賠進度", "送件後看得到審核到哪一關，不用一直問"], ["保單變更線上辦", "地址、受益人、繳費方式"], ["繳費提醒", "到期前通知，避免失效"],
            ["家庭保障地圖", "把配偶小孩的保障放在同一張圖上看"], ["理賠試算", "發生什麼事、這些保單加起來會賠多少"]].map(([t, d]) => (
            <div key={t} className="ccsi"><b>{t}</b><br />{d}</div>
          ))}
        </div>
      </div>
    </div></div>
  );
}
