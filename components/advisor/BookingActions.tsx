"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * 面談結果（原型 advclient 的 acnext mtk；4-ah、B1）：解鎖的開關在顧問手上。
 * 「已面談」才解鎖客戶端；「沒出現」維持鎖住並留紀錄；標錯了可以撤銷（寫稽核）。
 * 面談開始前可以取消（W1b，B1）：原因必填，會寄給客戶看。
 */
const CLOSED: Record<string, string> = {
  cancelled_by_client: "客戶取消了這次面談，時段已重新開放",
  cancelled_by_advisor: "你取消了這次面談，已通知客戶",
  rescheduled: "客戶改了時間（看最新的那筆）",
};
// 資料庫時間是 UTC（nowText：「YYYY-MM-DD HH:MM:SS」沒帶時區）→ 換成台灣時間顯示
const twTime = (s: string) => {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  if (isNaN(+d)) return s.slice(5, 16);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

export function BookingActions({ bookingId, status, started, statusAt, when }: { bookingId: string; status: string; started: boolean; statusAt: string | null; when: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const cancel = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/advisor/bookings/${bookingId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error ?? "沒有成功"); return; }
    setCancelling(false); router.refresh();
  };

  const act = async (action: "met" | "no_show" | "undo") => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/advisor/bookings/${bookingId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setConfirmUndo(false);
    if (!r.ok) { setMsg(j.error ?? "沒有成功"); return; }
    if (j.warning) setMsg(`⚠️ ${j.warning}`);
    router.refresh();
  };

  return (
    <div className="acnext mtk">
      <div className="anx">{when} 面談</div>
      {status === "met" || status === "no_show" ? (
        confirmUndo ? (
          <>
            <span className="mtwarn">撤銷後客戶端會{status === "met" ? "重新鎖住" : "回到已約"}，確定？</span>
            <button className="abtn pri" disabled={busy} onClick={() => act("undo")}>確定撤銷</button>
            <button className="abtn" onClick={() => setConfirmUndo(false)}>算了</button>
          </>
        ) : (
          <>
            <span className={status === "met" ? "mtok" : "mtwarn"}>{status === "met" ? "✓ 已面談" : "客戶沒出現・維持鎖住"}{statusAt && ` · ${twTime(statusAt)} 由你標記`}{status === "met" && "　客戶的「我的分析」已解鎖"}</span>
            <button className="abtn" onClick={() => setConfirmUndo(true)}>標錯了，撤銷</button>
          </>
        )
      ) : status !== "booked" ? <span className="mtwarn">{CLOSED[status] ?? "這筆預約已取消"}</span> : cancelling ? (
        <>
          <input className="asrch" style={{ flex: "1 1 260px", maxWidth: "none" }} placeholder="取消原因（會寄給客戶看，例如：臨時要出差）" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} aria-label="取消原因" autoFocus />
          <button className="abtn pri" disabled={busy || reason.trim().length < 2} onClick={cancel}>{busy ? "取消中…" : "確定取消並通知客戶"}</button>
          <button className="abtn" disabled={busy} onClick={() => { setCancelling(false); setReason(""); }}>算了</button>
        </>
      ) : (
        <>
          <button className="abtn pri big" disabled={busy || !started} onClick={() => act("met")}>已面談，解鎖給客戶</button>
          <button className="abtn" disabled={busy || !started} onClick={() => act("no_show")}>客戶沒出現</button>
          {!started && <button className="abtn" disabled={busy} onClick={() => setCancelling(true)}>取消這次面談</button>}
          {!started && <span className="pfhint" style={{ marginTop: 0, flexBasis: "100%" }}>面談開始前 15 分鐘起可以標記結果。客戶可以自己在面談前 2 小時以前改期或取消，改了你會收到通知。</span>}
        </>
      )}
      {msg && <span className="mtwarn" style={{ flexBasis: "100%" }}>{msg}</span>}
    </div>
  );
}
