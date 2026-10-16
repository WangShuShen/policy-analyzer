"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * 客戶自己刪存摺／刪帳號（4-aw）：按下去馬上生效、不能復原，所以確認步驟做在頁面裡（不跳視窗）。
 *   刪存摺：先說清楚會刪什麼 →「確定刪除」
 *   刪帳號：先說清楚會刪什麼、未來預約會取消並通知顧問 → 打「刪除」兩個字 →「永久刪除我的帳號」
 */
export function PassbookDelete({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/me/passbook", { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有刪成功，請再試一次"); return; }
    setOpen(false); router.refresh();
  };
  if (!open) return (
    <div className="er-row"><button type="button" className="er-link" onClick={() => setOpen(true)}>刪除我的保險存摺</button></div>
  );
  return (
    <div className="er-box" role="group" aria-label="刪除保險存摺">
      <div className="er-t">確定要刪除保險存摺嗎？</div>
      <ul className="er-list">
        <li>會刪掉你上傳的存摺{count > 0 ? `，和讀出來的 ${count} 張保單` : "和讀出來的保單"}</li>
        <li>「我的分析」裡「你現在的保障」和「哪些地方還不夠」會一起清掉，顧問也看不到了</li>
        <li><b>刪了不能復原</b>，之後想要可以再傳一次</li>
      </ul>
      {err && <div className="rd-err" style={{ margin: "0 0 10px" }}>{err}</div>}
      <div className="er-acts">
        <button type="button" className="ccbtn er-danger" disabled={busy} onClick={go}>{busy ? "刪除中…" : "確定刪除"}</button>
        <button type="button" className="ccbtn" disabled={busy} onClick={() => { setOpen(false); setErr(null); }}>先不要</button>
      </div>
    </div>
  );
}

export function AccountDelete() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/me/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: word.trim() }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有刪成功，請再試一次"); return; }
    setDone(true);
  };
  if (done) return (
    <div className="ccc wide er-done">
      <div className="ccb">你的帳號已經刪除</div>
      <div className="ccd">確認信已經寄到你的信箱。系統備份會在 30 天內自動清除。之後想再用 RADIA，用同一個 Google 帳號登入會是全新的帳號。</div>
      <div className="ccacts"><a className="ccbtn pri" href="/welcome">回到首頁</a></div>
    </div>
  );
  return (
    <div className="ccc wide">
      <div className="cct">刪除我的帳號</div>
      {!open ? <>
        <div className="ccd">馬上刪除你在 RADIA 的帳號和所有資料，不用等我們處理。</div>
        <div className="er-row" style={{ marginTop: 6 }}><button type="button" className="er-link" onClick={() => setOpen(true)}>我要刪除帳號</button></div>
      </> : (
        <div className="er-box" role="group" aria-label="刪除帳號">
          <div className="er-t">刪除後會發生什麼</div>
          <ul className="er-list">
            <li>你的諮詢對話、分析、保險存摺、預約紀錄全部刪除，顧問也看不到了</li>
            <li>還沒到的面談會自動取消，我們會寫信通知顧問</li>
            <li>刪完寄一封確認信給你；系統備份會在 30 天內自動清除</li>
            <li><b>刪了不能復原</b>。之後用同一個 Google 帳號登入，會是全新的帳號</li>
          </ul>
          <label className="er-lab" htmlFor="er-word">確定的話，請輸入「刪除」兩個字</label>
          <input id="er-word" className="md-ta er-in" value={word} onChange={e => setWord(e.target.value)} autoComplete="off" placeholder="刪除" />
          {err && <div className="rd-err" style={{ margin: "0 0 10px" }}>{err}</div>}
          <div className="er-acts">
            <button type="button" className="ccbtn er-danger" disabled={busy || word.trim() !== "刪除"} onClick={go}>{busy ? "刪除中…" : "永久刪除我的帳號"}</button>
            <button type="button" className="ccbtn" disabled={busy} onClick={() => { setOpen(false); setWord(""); setErr(null); }}>先不要</button>
          </div>
        </div>
      )}
    </div>
  );
}
