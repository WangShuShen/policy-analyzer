"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * 面談結果（原型 advclient 的 acnext mtk；4-ah、B1）：解鎖的開關在顧問手上。
 * 「已面談」才解鎖客戶端；「沒出現」維持鎖住並留紀錄；標錯了可以撤銷（寫稽核）。
 */
export function BookingActions({ bookingId, status, started, statusAt, when }: { bookingId: string; status: string; started: boolean; statusAt: string | null; when: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

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
            <span className={status === "met" ? "mtok" : "mtwarn"}>{status === "met" ? "✓ 已面談" : "客戶沒出現・維持鎖住"}{statusAt && ` · ${statusAt.slice(5, 16)} 由你標記`}{status === "met" && "　客戶的「我的分析」已解鎖"}</span>
            <button className="abtn" onClick={() => setConfirmUndo(true)}>標錯了，撤銷</button>
          </>
        )
      ) : status !== "booked" ? <span className="mtwarn">這筆預約已取消</span> : (
        <>
          <button className="abtn pri big" disabled={busy || !started} onClick={() => act("met")}>已面談，解鎖給客戶</button>
          <button className="abtn" disabled={busy || !started} onClick={() => act("no_show")}>客戶沒出現</button>
          {!started && <span className="pfhint" style={{ marginTop: 0 }}>面談開始後才能標記。改期或取消請回覆客戶的預約信（自助改期在 W1b）</span>}
        </>
      )}
      {msg && <span className="mtwarn" style={{ flexBasis: "100%" }}>{msg}</span>}
    </div>
  );
}
