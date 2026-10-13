"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedbackRow } from "@/lib/devFeedback";

/* 開發版回饋清單：可篩狀態；顧問／管理者可改狀態、寫處理說明 */
const KIND: Record<string, string> = { broken: "壞掉了", not_wanted: "不是我要的", wording: "文字要改", idea: "想法" };
const STATUS: [string, string][] = [["new", "新"], ["in_progress", "處理中"], ["fixed", "已修待複測"], ["closed", "結案"]];
const ROLE: Record<string, string> = { customer: "客戶", advisor: "顧問", admin: "管理者", guest: "未登入" };
const when = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function FeedbackList() {
  const [items, setItems] = useState<FeedbackRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [filter, setFilter] = useState<string>("open");
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    fetch("/api/dev/feedback").then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error ?? "讀不到清單"); return; } setItems(j.items); setCanEdit(j.canEdit); }).catch(() => setErr("讀不到清單"));
  }, []);
  useEffect(load, [load]);

  const save = async (id: string, p: { status?: string; handlerNote?: string }) => {
    const r = await fetch("/api/dev/feedback", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...p }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "沒有存成功"); return; }
    load();
  };

  if (err) return <div className="rd-err">{err}</div>;
  if (!items) return <div className="rd-loading">讀取中…</div>;
  const shown = items.filter(i => filter === "all" ? true : filter === "open" ? i.status !== "closed" : i.status === filter);
  const count = (s: string) => items.filter(i => i.status === s).length;

  return (
    <>
      <div className="seg" style={{ margin: "14px 0" }}>
        {[["open", `未結案（${items.length - count("closed")}）`], ...STATUS.map(([k, l]) => [k, `${l}（${count(k)}）`]), ["all", `全部（${items.length}）`]].map(([k, l]) => (
          <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 ? <div className="anzempty"><div className="aet">這裡還沒有回饋</div><div className="sub">在任何一頁按右下角的「回饋」就會出現在這裡。</div></div> : (
        <div className="rd-fblist">{shown.map(i => (
          <article key={i.id} className={`rd-fbrow s-${i.status}`}>
            <div className="rd-fbtop">
              <span className="rd-fbno">#{i.seq}</span>
              <span className={`rd-fbkind k-${i.kind}`}>{KIND[i.kind] ?? i.kind}</span>
              <a className="rd-fburl" href={i.pageUrl}>{i.pageUrl}</a>
              <span className="rd-fbwho">{ROLE[i.role] ?? i.role}{i.userName ? `・${i.userName}` : ""}・{when(i.createdAt)}</span>
            </div>
            <p className="rd-fbbody">{i.body}</p>
            <div className="rd-fbctl">
              {canEdit ? (
                <>
                  <select id={`st-${i.id}`} value={i.status} onChange={e => save(i.id, { status: e.target.value })} aria-label="狀態">
                    {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input id={`nt-${i.id}`} defaultValue={i.handlerNote ?? ""} placeholder="處理說明（修了什麼、哪一版）" maxLength={1000}
                    onBlur={e => { if (e.target.value !== (i.handlerNote ?? "")) save(i.id, { handlerNote: e.target.value }); }} />
                </>
              ) : (
                <span className="rd-fbst">{STATUS.find(([k]) => k === i.status)?.[1]}{i.handlerNote ? `：${i.handlerNote}` : ""}</span>
              )}
            </div>
          </article>
        ))}</div>
      )}
    </>
  );
}
