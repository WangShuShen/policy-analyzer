"use client";

import { useEffect, useState } from "react";

/*
 * 我的頁面 → 我的資料（4-ap、N5、N21）。同意書第六條寫的入口就是這裡：「我的頁面 → 我的資料」，15 日內處理。
 * 簡單版：選一種申請、寫一句說明送出，管理者人工處理；處理好了這裡看得到說明。
 */
const KINDS = [
  ["access", "查詢我的資料", "想看平台存了我哪些資料，或要一份複本"],
  ["correct", "更正資料", "哪一筆不對、應該改成什麼"],
  ["delete", "刪除我的資料／撤回同意", "要全部刪除，還是只刪某一部分；刪除後就不能再看分析結果"],
] as const;
const LABEL: Record<string, string> = Object.fromEntries(KINDS.map(([k, l]) => [k, l]));
const STATUS: Record<string, string> = { received: "已收到", processing: "處理中", done: "已完成" };
interface Req { id: string; kind: string; message: string; status: string; due: string; note: string | null; createdAt: string }
const md = (d: string) => { const [, m, day] = d.split("-").map(Number); return `${m} 月 ${day} 日`; };
const tw = (utc: string) => new Date(utc.replace(" ", "T") + "Z").toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });

export function MyData() {
  const [list, setList] = useState<Req[] | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const load = () => fetch("/api/me/data-requests").then(r => r.ok ? r.json() : null).then(d => d && setList(d.requests)).catch(() => {});
  useEffect(() => {
    load();
    // 手機上分頁列放不下五個，「我的資料」在最右邊：打開時把它捲進畫面
    document.querySelector(".actabs .actb.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/me/data-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, message: msg }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有送出去，請再試一次"); return; }
    setSent(j.due); setKind(null); setMsg(""); load();
  };
  return (
    <div className="ccg">
      <div className="ccc wide">
        <div className="cct">我的資料</div>
        <div className="ccb">你可以查詢、更正或刪除你在 RADIA 的資料</div>
        <div className="ccd">這是個資法給你的權利，平台不能拒絕或限制。送出後我們會在 <b>15 天內</b>回覆你（結果也會顯示在這裡）。</div>
      </div>
      {sent && <div className="ccc wide" style={{ background: "var(--brand-soft)", borderColor: "transparent" }}>
        <div className="ccb">已收到你的申請</div><div className="ccd">我們會在 {md(sent)} 前回覆你。處理好了會通知你，結果也會顯示在下面。</div></div>}
      <div className="ccc wide" style={{ padding: 0 }}>
        <div className="csopts" style={{ borderTop: 0 }}>
          {KINDS.map(([k, l, h]) => (
            <label key={k} className="csk md-opt">
              <input type="radio" name="kind" checked={kind === k} onChange={() => { setKind(k); setErr(null); setSent(null); }} />
              <span><b>{l}</b><small>{h}</small></span>
            </label>
          ))}
          {kind && <>
            <textarea className="md-ta" rows={3} maxLength={500} value={msg} onChange={e => setMsg(e.target.value)}
              placeholder={kind === "correct" ? "例：我的生日填錯了，應該是 1985 年" : kind === "delete" ? "例：請刪除我全部的資料" : "例：想知道你們存了我哪些資料"} />
            {kind === "delete" && <div className="ccd" style={{ marginTop: 0 }}>刪除或撤回同意後，平台就停止使用你的資料，你之前的分析也看不到了。撤回前已經做過的處理不受影響。</div>}
            {err && <div className="rd-err" style={{ margin: 0 }}>{err}</div>}
            <button className="btn" disabled={busy || msg.trim().length < 2} onClick={submit}>{busy ? "送出中…" : "送出申請"}</button>
          </>}
        </div>
      </div>
      {list && list.length > 0 && (
        <div className="ccc wide">
          <div className="cct">我的申請紀錄</div>
          {list.map(r => (
            <div key={r.id} className="md-row">
              <div className="ccb" style={{ fontSize: 14.5 }}>{LABEL[r.kind] ?? r.kind}<span className={`md-st ${r.status}`}>{STATUS[r.status] ?? r.status}</span></div>
              <div className="ccd" style={{ marginTop: 2 }}>{tw(r.createdAt)} 送出：「{r.message}」{r.status !== "done" && `　·　${md(r.due)} 前回覆`}</div>
              {r.note && r.status === "done" && <div className="ccd md-note"><b>處理說明：</b>{r.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
