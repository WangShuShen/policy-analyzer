import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdvisorPage } from "@/lib/advisor/pageGate";
import { advisorHasClient, clientDetail, clientConversation, clientFinance } from "@/lib/advisor/clients";
import { PANEL_TITLE, type PanelKey } from "@/lib/consult/analysis";
import { fmtTaipei } from "@/lib/booking/slots";
import { safeHtml } from "@/lib/consult/safeHtml";
import { BookingActions } from "@/components/advisor/BookingActions";
import { GapEditor } from "@/components/advisor/GapEditor";
import { AnalysisPanels } from "@/components/public/AnalysisPanels";
import { CrmPanel } from "@/components/advisor/CrmPanel";
import { NoCopy } from "@/components/advisor/NoCopy";
import { PassbookConfirm, PassbookPoller, PassbookRetry } from "@/components/public/PassbookParts";
import { listInteractions, relation } from "@/lib/crm/store";
import { timeline, viewStats } from "@/lib/crm/timeline";

/*
 * 客戶頁（原型 SCREENS.advclient）。
 * 摘要（需求點、預約與面談結果；W2：下次追蹤、互動紀錄、成交／沒成）｜諮詢紀錄（完整對話，唯讀，防複製）｜保單｜缺口分級（可改級）｜財務試算｜時間軸
 * 只看得到自己的客戶（有預約過，或手動建的）；查看寫稽核（N12）；不提供匯出（N8、w2-07）。
 * 手動建的客戶（w2-01）：沒有 AI 諮詢紀錄；存摺由顧問代傳（建立時已勾客戶同意，4-aq），分析照常。
 */
const TABS = [["sum", "摘要"], ["chat", "諮詢紀錄"], ["pol", "保單"], ["gap", "保障分析"], ["fin", "財務規劃"], ["time", "時間軸"]] as const;
const MATCH: Record<string, [string]> = { matched: ["已核對"], ai_read: ["AI 初步讀取"], pending: ["待補"], removed: ["客戶說不算"], unconfirmed: ["客戶還沒確認"] };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ tab?: string; conv?: string }> }) {
  const { advisorId, name: advisorName } = await requireAdvisorPage();
  const { userId } = await params;
  const { tab = "sum", conv } = await searchParams;
  if (!(await advisorHasClient(advisorId, userId))) redirect("/clients");
  const d = await clientDetail(advisorId, userId);
  if (!d) notFound();
  const now = Date.now();
  const rel = await relation(advisorId, userId);
  const manual = rel?.source === "manual";
  const interactions = tab === "sum" ? await listInteractions(advisorId, userId) : [];
  const tl = tab === "time" ? await timeline(advisorId, userId) : [];
  const views = tab === "sum" && !manual ? await viewStats(userId) : null;
  const pbApi = `/api/advisor/clients/${userId}/passbook`;
  const twNow = new Date(now).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const active = d.bookings.find(b => b.status !== "rescheduled") ?? d.bookings[0];   // 改期過的舊預約跳過，看新的那筆
  const pb = d.passbook;
  const n = pb.counts.total - pb.counts.removed - pb.counts.others;
  const convId = conv && d.conversations.some(c => c.id === conv) ? conv : d.conversations[0]?.id;
  const messages = tab === "chat" && convId ? await clientConversation(advisorId, userId, convId) : null;
  const finance = tab === "fin" && convId ? await clientFinance(userId, convId) : null;
  const convChips = (t: string) => d.conversations.length > 1 && (
    <div className="pfo">
      {d.conversations.map(c => <Link key={c.id} href={`/clients/${userId}?tab=${t}&conv=${c.id}`} className="lvt" aria-pressed={c.id === convId} style={{ textDecoration: "none" }}>{c.title} · {c.lastActiveAt.slice(0, 10)}</Link>)}
    </div>
  );

  const statusText = active?.status === "met" ? "已面談・已解鎖" : active?.status === "no_show" ? "客戶沒出現" : active ? "已預約・未面談" : "";
  return (
    <>
      <Link href="/clients" className="ah2" style={{ textDecoration: "none" }}>← 客戶</Link>
      <div className="achd" style={{ marginTop: 6 }}>
        <div className="ac1">{d.user.name}{statusText && <span className="acst">{statusText}</span>}</div>
        {manual ? <>
          <div className="ac2">{rel?.phone ?? "沒有留電話"}</div>
          <div className="ac2">自己開發的客戶 · {d.user.joinedAt.slice(0, 10)} 建立{rel?.note ? ` · ${rel.note}` : ""}</div>
        </> : <>
          <div className="ac2">{d.user.email}</div>
          <div className="ac2">從 AI 諮詢進線 {d.user.joinedAt.slice(0, 10)}{d.conversations[0] && ` · ${d.conversations[0].title}`}</div>
        </>}
      </div>
      {d.care && <div className="acare"><span className="acq">他在意的是</span><span className="acv">「{d.care}」</span></div>}

      <div className="actabs">
        {TABS.map(([k, t]) => <Link key={k} href={`/clients/${userId}?tab=${k}`} className={`actb ${tab === k ? "on" : ""}`} style={{ textDecoration: "none" }}>{t}</Link>)}
      </div>

      <div className="acbody">
        {tab === "sum" && (
          <>
            <div className="acgrid">
              <div className="acc"><div className="ack">已知狀況</div><div className="acvv"><b>{d.facts.length}</b> 項需求點</div></div>
              <div className="acc"><div className="ack">保單</div><div className="acvv">{pb.upload?.status === "done" ? <>已上傳保險存摺<br /><b>{n} 張 · {pb.counts.preliminary ? `${pb.counts.preliminary} 張 AI 初步` : "全部已核對"}</b>{pb.counts.pending ? `・${pb.counts.pending} 張待補` : ""}</> : pb.upload ? "解析中" : <span style={{ color: "var(--amber)" }}>還沒上傳存摺</span>}</div></div>
              <div className="acc"><div className="ack">缺口</div><div className="acvv">{d.gaps ? <><b>{d.gaps.filter(g => g.level === "must").length}</b> 項一定要補<br />{d.gaps.filter(g => g.level === "boost").length} 項建議補強</> : "有保單才判得出來"}</div></div>
              <div className="acc"><div className="ack">規劃書</div><div className="acvv"><span style={{ color: "var(--muted)" }}>W4 才會有</span></div></div>
              <div className="acc"><div className="ack">下次追蹤</div><div className="acvv">{rel?.outcome === "won" ? <b>已成交</b> : rel?.outcome === "lost" ? <span style={{ color: "var(--muted)" }}>沒成</span>
                : rel?.follow_up_on ? <><b>{rel.follow_up_on.slice(5).replace("-", "/")}</b>{rel.follow_up_note && <><br />{rel.follow_up_note}</>}</> : <span style={{ color: "var(--amber)" }}>還沒設定</span>}</div></div>
            </div>
            {!manual && <div className="acsrc" style={{ marginTop: 10 }}>{views
              ? <>客戶打開過「我的分析」<b>{views.count} 次</b>（共 {Math.max(1, Math.round(views.totalMs / 60_000))} 分鐘），最近一次 {new Date(views.last).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}{views.top && <>，在「{views.top}」停最久</>}</>
              : "客戶還沒打開過「我的分析」"}</div>}
            {active && <BookingActions bookingId={active.id} status={active.status} started={now >= Date.parse(active.startsAt) - 15 * 60_000} statusAt={active.statusAt}
              when={`${fmtTaipei(active.startsAt)} ${active.mode === "online" ? "線上" : "面對面"}`} />}
            <CrmPanel userId={userId} manualName={manual ? d.user.name : null} interactions={interactions}
              rel={rel && { source: rel.source, outcome: rel.outcome, outcomeNote: rel.outcome_note, followUpOn: rel.follow_up_on, followUpNote: rel.follow_up_note, phone: rel.phone, note: rel.note, consentAt: rel.consent_at }} />
            <div className="acnext" style={{ display: "block" }}>
              <div className="anx" style={{ marginBottom: 8 }}>他在對話裡說的</div>
              {d.facts.length === 0 ? <div className="ac2">還沒有需求點</div> : (
                <div className="ndl">{d.facts.map(f => (
                  <div key={f.key} className="ndi"><span className="ndk">{f.label}</span>
                    <span className="ndv">{f.display}{f.confidence === "estimated" && "（推估）"}{f.confidence === "confirmed" && "（客戶改過）"}</span></div>
                ))}</div>
              )}
            </div>
          </>
        )}

        {tab === "chat" && (
          <>
            {convChips("chat")}
            <NoCopy who={advisorName} at={twNow}>
            <div className="acchat" style={{ marginTop: 12 }}>
              {!messages?.length ? <div className="ac2">{manual ? "這是你自己開發的客戶，沒有 AI 諮詢紀錄。" : "還沒有對話"}</div> : messages.map(m => {
                const c = m.content;
                if (c.kind === "user") return <div key={m.id} className="acm me">{c.text}</div>;
                if (c.kind === "ai") return <div key={m.id} className="acm ai" dangerouslySetInnerHTML={{ __html: safeHtml(c.html) }} />;
                if (c.kind === "trend") return <div key={m.id} className="trd"><div className="trdh">📈 醫療現況</div><div className="trdt">{c.title}</div></div>;
                if (c.kind === "note") return <div key={m.id} className="dnote">{c.text}</div>;
                return <div key={m.id} className="dnote">客戶右欄出現「{PANEL_TITLE[c.key as PanelKey]?.[0] ?? c.key}」</div>;
              })}
            </div>
            </NoCopy>
            <div className="acsrc">合規 · N8：諮詢紀錄顧問可以查，<b>但不可匯出外流</b>（不能複製、不能列印，畫面帶你的名字浮水印），而且只看得到自己的客戶。這次查看已記錄。</div>
          </>
        )}

        {tab === "pol" && (
          manual && (!pb.upload || pb.upload.status === "failed" || pb.upload.status === "confirming" || pb.upload.status === "queued" || pb.upload.status === "reading" || pb.upload.status === "matching") ? (
            <div style={{ marginTop: 8 }}>
              {!pb.upload || pb.upload.status === "failed" ? <>
                <div className="ac2" style={{ marginBottom: 10 }}>{pb.upload ? "上次沒讀成功，請重新上傳。" : "這是你自己開發的客戶，保險存摺由你代為上傳（建立時已勾選取得客戶同意）。PDF 在你的瀏覽器裡解鎖，身分證字號不會傳到伺服器。"}</div>
                <PassbookRetry api={pbApi} />
              </> : pb.upload.status === "confirming" ? <PassbookConfirm uploadId={pb.upload.id} policies={pb.policies} api={pbApi} />
                : <><div className="ac2">解析中…（通常 1～2 分鐘，畫面會自己更新）</div><PassbookPoller status={pb.upload.status} api={pbApi} /></>}
            </div>
          ) : !pb.upload ? <div className="ac2">客戶還沒上傳保險存摺。預約確認信已經提醒他面談前上傳。</div> : (
            <>
              <div className="acpl">
                {pb.policies.map(p => (
                  <div key={p.id} className="acpr">
                    <div className="acpn"><b>{p.productName}</b><span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{p.company} · {p.amountText}{p.effectiveDate && ` · ${p.effectiveDate} 生效`}{p.status && ` · ${p.status}`}{p.matchNote && ` · ${p.matchNote}`}</span>
                      {p.items.length > 0 && <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>{p.items.map(i => `${i.name} ${i.value}`).join("　")}</span>}</div>
                    <span className={`tagx ${p.matchStatus === "matched" ? "ok" : "gap"}`}>{p.forOther ? `被保險人：${p.forOther}` : (MATCH[p.matchStatus] ?? MATCH.unconfirmed)[0]}</span>
                  </div>
                ))}
              </div>
              <div className="acsrc">來源：客戶 {pb.upload.createdAt.slice(0, 10)} 上傳保險存摺 · 系統自動比對保單資料庫{pb.counts.preliminary > 0 && "；「AI 初步讀取」的要在保單審核核過，規劃書才能用（P4）"}</div>
            </>
          )
        )}

        {tab === "gap" && (d.gaps ? <GapEditor userId={userId} initial={d.gaps} /> : <div className="ac2">客戶的保單還沒解析完，判不了級。</div>)}

        {tab === "fin" && (
          <>
            {convChips("fin")}
            <div className="acsrc" style={{ marginTop: 6 }}>跟客戶面談解鎖後在「我的分析」看這段對話的是同一份數字（缺口一律 0% 報酬，E2）。</div>
            {!finance || finance.open.length === 0 ? <div className="ac2" style={{ marginTop: 10 }}>{manual ? "自己開發的客戶沒有 AI 諮詢，財務試算要等 W4 規劃書。" : "這段對話沒有聊到財務規劃。"}</div> : <div className="anzbody"><AnalysisPanels a={finance} /></div>}
          </>
        )}
        {tab === "time" && (
          tl.length === 0 ? <div className="ac2">還沒有任何紀錄</div> : (
            <ul className="crm-tl">{tl.map((x, i) => (
              <li key={i} className={x.who === "customer" ? "cust" : ""}><time>{new Date(x.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time>{x.who === "customer" ? "客戶 " : ""}{x.text}</li>
            ))}</ul>
          )
        )}
      </div>
    </>
  );
}
