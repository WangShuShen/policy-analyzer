"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * 個資申請（4-ap、N5）：客戶從「我的頁面 → 我的資料」送出的查詢／更正／刪除申請。
 * 處理本身先人工（查資料、改資料、刪資料都由管理者做），這裡標「處理中／已完成」並寫處理說明（客戶看得到）。
 * 期限：同意書承諾 15 日內（個資法第 13 條：查詢 15 日、更正刪除 30 日，必要時可延長一次並書面通知）。自動刪除留到 W7。
 * 打開這頁會留一筆查閱紀錄（看得到客戶姓名、信箱與申請內容）。
 */
const KIND: Record<string, string> = { access: "查詢我的資料", correct: "更正資料", delete: "刪除我的資料／撤回同意" };
const STATUS: Record<string, [string, string]> = { received: ["已收到", "pending"], processing: ["處理中", "pending"], done: ["已完成", "live"] };
interface Req { id: string; userId: string; name: string; email: string; kind: string; message: string; status: string; due: string; note: string | null; handledBy: string | null; handledAt: string | null; createdAt: string }
const tw = (utc: string) => new Date(utc.replace(" ", "T") + "Z").toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

export default function DataRequests() {
  const [open, setOpen] = useState(true);
  const [list, setList] = useState<Req[] | null>(null);
  const load = useCallback(async () => { const r = await fetch(`/api/admin/data-requests${open ? "?open=1" : ""}`); if (r.ok) setList((await r.json()).requests); }, [open]);
  useEffect(() => { load(); }, [load]);
  return (
    <div style={{ marginTop: 18 }}>
      <div className="nw-tabs" style={{ padding: 0, marginBottom: 12 }}>
        <button className={`nw-tab ${open ? "on" : ""}`} onClick={() => setOpen(true)}>待處理</button>
        <button className={`nw-tab ${!open ? "on" : ""}`} onClick={() => setOpen(false)}>全部</button>
      </div>
      <div className="nw-note" style={{ marginBottom: 12 }}>同意書承諾 15 日內處理。查詢、更正、刪除都先由你人工處理（自動刪除在 W7），處理完在這裡標「已完成」並寫說明，客戶會在「我的資料」看到。</div>
      {list === null ? <div className="nw-ed" style={{ color: "var(--muted)" }}>讀取中…</div>
        : !list.length ? <div className="nw-ed" style={{ color: "var(--muted)" }}>{open ? "沒有待處理的申請" : "還沒有任何申請"}</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{list.map(r => <Item key={r.id} r={r} onDone={load} />)}</div>}
    </div>
  );
}

function Item({ r, onDone }: { r: Req; onDone: () => void }) {
  const [note, setNote] = useState(r.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const late = r.status !== "done" && r.due < today();
  const set = async (status: "processing" | "done") => {
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/data-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, status, note }) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "沒有成功"); return; }
    onDone();
  };
  return (
    <div className="nw-ed">
      <div className="nw-edh">
        <div><span className={`pill ${STATUS[r.status]?.[1] ?? "draft"}`}>{STATUS[r.status]?.[0] ?? r.status}</span> <b style={{ fontSize: 14 }}>{KIND[r.kind] ?? r.kind}</b></div>
        <div className="s" style={{ color: late ? "var(--must)" : undefined, fontWeight: late ? 700 : undefined }}>{r.status === "done" ? `${r.handledBy ?? ""} ${r.handledAt ? tw(r.handledAt) : ""} 完成` : `${late ? "已逾期！" : ""}期限 ${r.due}`}</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>{r.name}　·　{r.email}　·　{tw(r.createdAt)} 送出</div>
      <div className="nw-chk" style={{ marginBottom: 10 }}>「{r.message}」</div>
      {r.status === "done" ? <div style={{ fontSize: 13 }}><b>處理說明：</b>{r.note}</div> : (
        <>
          <div className="nw-f"><label>處理說明（標已完成時必填，客戶會看到；不要寫別人的資料）</label>
            <textarea className="nw-in" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="例：已將你的生日更正為 1985/3/2；或：已刪除你的帳號與所有諮詢資料" /></div>
          {err && <div className="nw-err" style={{ background: "var(--must-soft)", color: "var(--must)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
          <div className="nw-acts">
            {r.status === "received" && <button className="nw-b" disabled={busy} onClick={() => set("processing")}>標處理中</button>}
            <button className="nw-b pri" disabled={busy || note.trim().length < 2} onClick={() => set("done")}>標已完成</button>
          </div>
        </>
      )}
    </div>
  );
}
