"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Foot } from "@/components/radia/Foot";
import type { AdvisorCard } from "@/lib/booking/service";
import type { Slot } from "@/lib/booking/slots";

/*
 * 選時段（原型 SCREENS.slots）。
 * 手機：日期橫向捲動＋時段三欄；桌機：整週格狀一次看完（6 天一頁）。時間在伺服器端會重新驗證。
 */
const WD = ["日", "一", "二", "三", "四", "五", "六"];

export function SlotPicker({ advisor, slots, reschedule }: { advisor: AdvisorCard; slots: Slot[]; reschedule?: { id: string; startsAt: string } }) {
  const router = useRouter();
  const days = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) m.set(s.localDate, [...(m.get(s.localDate) ?? []), s]);
    return [...m.entries()];
  }, [slots]);
  const [day, setDay] = useState(days[0]?.[0] ?? null);
  const [pick, setPick] = useState<Slot | null>(null);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<"online" | "onsite">(advisor.modes[0] ?? "online");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const week = days.slice(page * 6, page * 6 + 6);
  const times = [...new Set(week.flatMap(([, ss]) => ss.map(s => s.localTime)))].sort();
  const dayLabel = (d: string, wd: number) => { const [, mm, dd] = d.split("-").map(Number); return { w: `週${WD[wd]}`, d: `${mm}/${dd}` }; };

  const submit = async () => {
    if (!pick) return;
    setBusy(true); setError("");
    const r = reschedule
      ? await fetch(`/api/bookings/${reschedule.id}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startsAt: pick.startsAt, mode }) })
      : await fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ advisorId: advisor.id, startsAt: pick.startsAt, mode }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { router.push(reschedule ? "/me?rescheduled=1" : "/me?booked=1"); return; }
    setBusy(false); setError(j.error ?? "沒約成功，請再試一次");
    if (j.code === "slot_taken") { setPick(null); router.refresh(); }
    if (j.code === "already_booked") router.push("/me");
  };

  return (
    <div className="cols"><div className="main">
      <div className="titlerow"><svg className="ill i34" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-cal" /></svg>
        <div><h2 className="t" style={{ marginBottom: 4 }}>什麼時候方便？</h2>
          <p className="sub">{advisor.name} 顧問 · 一次大約 40 分鐘{reschedule && <><br />改時間：原本約在 <b>{new Date(reschedule.startsAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</b>，挑一個新的</>}</p></div></div>

      {days.length === 0 ? (
        <div className="anzempty" style={{ marginTop: 16 }}><div className="aet">{advisor.name} 顧問接下來兩週都約滿了</div>
          <div className="ccacts"><a className="ccbtn" href="/advisors">看看其他顧問</a></div></div>
      ) : (
        <div className="sched">
          <div className="days">{days.map(([d, ss]) => { const L = dayLabel(d, ss[0].weekday); return (
            <button key={d} className="day" aria-pressed={d === day} onClick={() => { setDay(d); setPick(null); }}><div className="dw">{L.w}</div><div className="dd">{L.d}</div></button>); })}</div>
          <div className="slots">{(days.find(([d]) => d === day)?.[1] ?? []).map(s => (
            <button key={s.startsAt} className="slot" aria-pressed={pick?.startsAt === s.startsAt} onClick={() => setPick(s)}>{s.localTime}</button>))}</div>
          <div className="week">
            <div />{week.map(([d, ss]) => { const L = dayLabel(d, ss[0].weekday); return <div key={d} className="wh">{L.w}<b>{L.d}</b></div>; })}
            {Array.from({ length: 6 - week.length }).map((_, i) => <div key={`e${i}`} />)}
            {times.map(t => (
              <div key={t} style={{ display: "contents" }}>
                <div className="rowlab">{t}</div>
                {week.map(([d, ss]) => { const s = ss.find(x => x.localTime === t); return s
                  ? <button key={d} className="slot" aria-pressed={pick?.startsAt === s.startsAt} onClick={() => { setPick(s); setDay(d); }}>可約</button>
                  : <button key={d} className="slot" disabled>—</button>; })}
                {Array.from({ length: 6 - week.length }).map((_, i) => <div key={`e${i}`} />)}
              </div>
            ))}
          </div>
          {days.length > 6 && (
            <div className="ccacts">
              <button className="ccbtn" disabled={page === 0} onClick={() => setPage(page - 1)}>← 前 6 天</button>
              <button className="ccbtn" disabled={(page + 1) * 6 >= days.length} onClick={() => setPage(page + 1)}>後 6 天 →</button>
            </div>
          )}
          {advisor.modes.length === 2 && (
            <div className="dopts" role="radiogroup" aria-label="面談方式" style={{ marginTop: 16 }}>
              {(["online", "onsite"] as const).map(m => (
                <button key={m} role="radio" aria-checked={mode === m} className="dopt" onClick={() => setMode(m)}
                  style={mode === m ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : undefined}>
                  {m === "online" ? "線上視訊" : `面對面${advisor.onsiteArea ? `（${advisor.onsiteArea}）` : ""}`}</button>
              ))}
            </div>
          )}
          {error && <div className="rd-err">{error}</div>}
        </div>
      )}
      <Foot>
        <button className="btn" disabled={!pick || busy} onClick={submit}>{busy ? (reschedule ? "改期中…" : "預約中…") : pick ? `${reschedule ? "改到" : "確認預約"} ${pick.localDate.slice(5).replace("-", "/")} ${pick.localTime}` : reschedule ? "改時間" : "確認預約"}</button>
        {reschedule ? <a className="btn ghost" href="/me">不改了</a> : <a className="btn ghost" href="/advisors">換一位顧問</a>}
      </Foot>
    </div></div>
  );
}
