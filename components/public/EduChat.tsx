"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { safeHtml } from "@/lib/consult/safeHtml";
import { EDU_OPENING, EDU_SUGGESTIONS } from "@/lib/consult/script";
import { useDockHeight, useVisualViewport } from "./useVisualViewport";

/*
 * 衛教模式（4-z、N22）：沒有同意個資蒐集時走這條。不用登入、一個字都不記——
 * 對話只存在這個分頁的記憶體裡，關掉就沒了；伺服器不寫資料庫。
 */
type Line = { role: "user" | "assistant"; text: string };

export function EduChat() {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useVisualViewport();   // 手機鍵盤彈出：輸入框貼在鍵盤上面
  useDockHeight(dockRef, []);   // 開發版回饋鈕放在輸入列上面
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [lines, busy]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true); setError(""); setText("");
    const history = lines;
    setLines([...history, { role: "user", text: q }]);
    try {
      const r = await fetch("/api/consult/edu", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: q, history }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "沒送出去，請再試一次"); setLines(history); return; }
      setLines([...history, { role: "user", text: q }, { role: "assistant", text: j.html }]);
    } catch { setError("連線失敗，請再試一次"); setLines(history); }
    finally { setBusy(false); }
  };

  // 原型 SCREENS.chat 的衛教模式（S.consent===false）：同一個畫面，不顯示階段與右欄
  return (
    <div className="dmo">
      {/* 一屏（10/15）：跟 ConsultChat 同一個版面——標題一行、對話區自己捲、輸入列固定底部 */}
      <div className="dhead edu">
        <div className="dhead-t">
          <h2 className="t">想問什麼都可以</h2>
          <p className="sub">你選擇不提供個人資料，所以這裡是<b>衛教模式</b>——我只回答知識性問題，<b>不會記下任何你說的事</b>。</p>
        </div>
      </div>
      <div className="cvro" style={{ marginTop: 10, flex: "none" }}><span>想知道<b>你自己的保單夠不夠</b>？那需要你的資料才算得出來。</span>
        <Link className="cvrob" href="/welcome/consent">去看同意書</Link></div>
      <div className="dchat" ref={ref} aria-live="polite">
        {EDU_OPENING.map((h, i) => <div key={"o" + i} className="acm ai" dangerouslySetInnerHTML={{ __html: safeHtml(h) }} />)}
        {lines.map((l, i) => l.role === "user"
          ? <div key={i} className="acm me">{l.text}</div>
          : <div key={i} className="acm ai" dangerouslySetInnerHTML={{ __html: safeHtml(l.text) }} />)}
        {busy && <div className="acm ai tp"><span className="aitype"><i /><i /><i /></span></div>}
      </div>
      <div className="ddock" ref={dockRef}>
        {lines.length === 0 && <div className="dopts">{EDU_SUGGESTIONS.map(s => <button key={s} className="dopt" onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>}
        {error && <div className="rd-err">{error}</div>}
        <form className="dinp" onSubmit={e => { e.preventDefault(); ask(text); }} autoComplete="off">
          <input className="dinf" value={text} onChange={e => setText(e.target.value)} maxLength={500} enterKeyHint="send" placeholder="例如：實支實付跟日額型差在哪？" disabled={busy} aria-label="輸入你的問題" />
          <button className="dins" type="submit" disabled={busy || !text.trim()}>送出</button>
        </form>
        <div className="dinn"><span>這段對話不會被記錄，關掉頁面就沒了。</span></div>
      </div>
    </div>
  );
}
