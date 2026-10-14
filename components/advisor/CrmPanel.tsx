"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/*
 * 客戶頁的客戶管理（W2 w2-02；原型 advclient 3164–3174「下次追蹤」「下一步」）。
 * 下次追蹤日（到了會出現在首頁待辦）、成交／沒成、互動紀錄（面談、提案、電話、備註）；手動客戶可以改姓名電話備註。
 * 範圍 B 級：不做保全、續期、理賠、轉介紹、業績報表（4-e）。
 */
export interface CrmRelation { source: string; outcome: string; outcomeNote: string | null; followUpOn: string | null; followUpNote: string | null; phone: string | null; note: string | null; consentAt: string | null }
export interface CrmInteraction { id: string; kind: string; day: string; summary: string }
const KIND: Record<string, string> = { meeting: "面談", proposal: "提案", call: "電話", note: "備註" };
const OUTCOME: Record<string, string> = { open: "進行中", won: "已成交", lost: "沒成" };
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + 8 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

export function CrmPanel({ userId, rel, interactions, manualName }: { userId: string; rel: CrmRelation | null; interactions: CrmInteraction[]; manualName: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fu, setFu] = useState(rel?.followUpOn ?? ""), [fuNote, setFuNote] = useState(rel?.followUpNote ?? "");
  const [oc, setOc] = useState(rel?.outcome ?? "open"), [ocNote, setOcNote] = useState(rel?.outcomeNote ?? "");
  const [kind, setKind] = useState("meeting"), [day, setDay] = useState(today()), [sum, setSum] = useState("");
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(manualName ?? ""), [phone, setPhone] = useState(rel?.phone ?? ""), [note, setNote] = useState(rel?.note ?? "");

  const post = async (body: object, after?: () => void) => {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/advisor/clients/${userId}/crm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "沒有成功"); return; }
    after?.(); router.refresh();
  };

  return (
    <div className="crm-panel">
      {err && <div className="crm-err">{err}</div>}

      <div className="crm-box">
        <div className="anx">下次追蹤</div>
        <div className="crm-row">
          <input type="date" className="crm-in crm-date" value={fu} min={today()} onChange={e => setFu(e.target.value)} aria-label="下次追蹤日" />
          {[["3 天後", 3], ["1 週後", 7], ["2 週後", 14]].map(([t, n]) => <button key={t} type="button" className="abtn" onClick={() => setFu(plusDays(n as number))}>{t}</button>)}
        </div>
        <input className="crm-in" value={fuNote} maxLength={200} onChange={e => setFuNote(e.target.value)} placeholder="要做什麼（例：問她跟先生討論得怎樣）" />
        <div className="crm-acts">
          {rel?.followUpOn && <button className="abtn" disabled={busy} onClick={() => post({ action: "follow_up", day: null }, () => { setFu(""); setFuNote(""); })}>不用追蹤了</button>}
          <button className="abtn pri" disabled={busy || !fu} onClick={() => post({ action: "follow_up", day: fu, note: fuNote || null })}>{rel?.followUpOn ? "更新追蹤日" : "設定追蹤日"}</button>
        </div>
        <div className="ah2">日期到了會出現在首頁待辦。{rel?.followUpOn && <>目前：<b>{rel.followUpOn}</b>{rel.followUpNote ? `・${rel.followUpNote}` : ""}</>}</div>
      </div>

      <div className="crm-box">
        <div className="anx">記一筆互動</div>
        <div className="crm-row">
          <select className="crm-in crm-sel" value={kind} onChange={e => setKind(e.target.value)} aria-label="類型">{Object.entries(KIND).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <input type="date" className="crm-in crm-date" value={day} max={today()} onChange={e => setDay(e.target.value)} aria-label="日期" />
        </div>
        <textarea className="crm-in" rows={2} value={sum} maxLength={1000} onChange={e => setSum(e.target.value)}
          placeholder={kind === "proposal" ? "例：提了醫療實支＋失能，她說要跟先生討論" : kind === "call" ? "例：打電話確認面談時間" : "例：談了退休缺口，她最擔心醫療費"} />
        <div className="crm-acts"><button className="abtn pri" disabled={busy || sum.trim().length < 2} onClick={() => post({ action: "interaction", kind, day, summary: sum }, () => setSum(""))}>記下來</button></div>
        {interactions.length > 0 && (
          <ul className="crm-list">{interactions.map(i => (
            <li key={i.id}><span className="crm-k">{KIND[i.kind] ?? i.kind}</span><span className="crm-d">{i.day.slice(5).replace("-", "/")}</span><span className="crm-s">{i.summary}</span>
              <button className="alink" disabled={busy} onClick={() => confirm("刪掉這筆紀錄？") && post({ action: "delete_interaction", id: i.id })}>刪除</button></li>
          ))}</ul>
        )}
      </div>

      <div className="crm-box">
        <div className="anx">結果</div>
        <div className="crm-row">
          {Object.entries(OUTCOME).map(([k, t]) => <button key={k} type="button" className={`abtn ${oc === k ? "pri" : ""}`} aria-pressed={oc === k} onClick={() => setOc(k)}>{t}</button>)}
        </div>
        {oc !== "open" && <input className="crm-in" value={ocNote} maxLength={200} onChange={e => setOcNote(e.target.value)} placeholder={oc === "won" ? "成交了什麼（例：醫療實支＋失能）" : "沒成的原因（例：說要再想想）"} />}
        <div className="crm-acts"><button className="abtn pri" disabled={busy || (oc === (rel?.outcome ?? "open") && (ocNote || "") === (rel?.outcomeNote ?? "")) || (oc !== "open" && ocNote.trim().length < 2)}
          onClick={() => post({ action: "outcome", outcome: oc, note: oc === "open" ? null : ocNote })}>儲存結果</button></div>
        <div className="ah2">沒成的客戶不會刪掉，原因留著——累積起來看得出卡在哪一關。</div>
      </div>

      {rel?.source === "manual" && (
        <div className="crm-box">
          <div className="anx">客戶資料（你手動建的）</div>
          {!edit ? (
            <>
              <div className="ah2">電話：{rel.phone ?? "—"}{rel.note ? `　·　${rel.note}` : ""}</div>
              <div className="ah2">已取得客戶同意：{rel.consentAt ? `${rel.consentAt.slice(0, 10)} 由你勾選確認` : "—"}</div>
              <div className="crm-acts"><button className="abtn" onClick={() => setEdit(true)}>修改</button></div>
            </>
          ) : (
            <>
              <input className="crm-in" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="姓名" aria-label="姓名" />
              <input className="crm-in" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} placeholder="電話" aria-label="電話" inputMode="tel" />
              <textarea className="crm-in" rows={2} value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="備註" aria-label="備註" />
              <div className="crm-acts"><button className="abtn" onClick={() => setEdit(false)}>取消</button>
                <button className="abtn pri" disabled={busy || !name.trim()} onClick={() => post({ action: "profile", name, phone: phone || null, note: note || null }, () => setEdit(false))}>儲存</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
