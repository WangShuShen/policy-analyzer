"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/*
 * 客戶自助改期、取消（實作設計 B5）：面談前 2 小時以前都可以，不限次數。
 * 2 小時內改成「直接回覆確認信跟顧問說」——服務免費，門檻太高客戶乾脆不來，反而變成沒出現。
 */
export function MeBookingActions({ bookingId, advisorId, startsAt, advisorName }: { bookingId: string; advisorId: string; startsAt: string; advisorName: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const late = Date.parse(startsAt) - Date.now() < 2 * 3600_000;

  if (late) return <div className="ccd" style={{ fontSize: 12.5 }}>面談前 2 小時內不能自己改了。臨時有事，直接回覆確認信，就會寄到 {advisorName} 顧問那裡。</div>;

  const cancel = async () => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有取消成功，請再試一次"); return; }
    router.push("/me?cancelled=1"); router.refresh();
  };

  return (
    <>
      {ask ? (
        <div className="ccacts">
          <span className="ccd" style={{ margin: 0, flexBasis: "100%" }}>確定要取消嗎？你的資料都會留著，之後想談再約就好。</span>
          <button className="ccbtn pri" disabled={busy} onClick={cancel}>{busy ? "取消中…" : "確定取消"}</button>
          <button className="ccbtn" disabled={busy} onClick={() => setAsk(false)}>不取消了</button>
        </div>
      ) : (
        <div className="ccacts">
          <Link className="ccbtn" href={`/advisors/${advisorId}?reschedule=${bookingId}`}>改時間</Link>
          <button className="ccbtn" onClick={() => setAsk(true)}>取消預約</button>
        </div>
      )}
      {err && <div className="rd-err">{err}</div>}
      <div className="ccd" style={{ fontSize: 12 }}>面談前 2 小時以前都可以自己改，改了會通知 {advisorName} 顧問。</div>
    </>
  );
}
