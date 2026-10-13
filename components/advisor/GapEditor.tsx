"use client";

import { useState } from "react";
import type { FinalGapRow } from "@/lib/calc/gaps";
import { Evidence } from "@/components/public/GapEvidence";

/*
 * 缺口分級核對（G1；表格照原型顧問端「保障分析」的 gptbl）。
 * 系統先判，顧問可以改；改級必填一句理由、留紀錄；改回系統原判＝撤銷。客戶解鎖後看到的就是這裡核過的版本。
 */
const LV: Record<string, string> = { must: "一定要補", boost: "建議補強", ok: "夠了", later: "這輪先不做" };

export function GapEditor({ userId, initial }: { userId: string; initial: FinalGapRow[] }) {
  const [rows, setRows] = useState(initial);
  const [edit, setEdit] = useState<string | null>(null);
  const [level, setLevel] = useState("boost");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const save = async (key: string) => {
    setErr("");
    const r = await fetch(`/api/advisor/clients/${userId}/gaps`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, level, reason }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "沒有存成功"); return; }
    setRows(j.rows); setEdit(null); setReason("");
  };
  const must = rows.filter(r => r.level === "must").length;

  return (
    <>
      <div className="gphd"><span className="ack">十格 · 現況對標準</span>
        <span className="tagx" style={{ color: "var(--amber)", background: "var(--amber-soft)" }}>系統依規則先判（G1–G8）· 你可以改</span>
        {must > 2 && <span className="tagx" style={{ color: "var(--must)", background: "var(--must-soft)" }}>一定要補已經 {must} 項——N18：不能每一項都推成必買</span>}</div>
      <div className="gptbl">
        <div className="gph"><span>險種</span><span>他現在有</span><span>標準</span><span>覆蓋</span><span>分級</span></div>
        {rows.map(r => (
          <div key={r.key} style={{ display: "contents" }}>
            <div className="gpr">
              <div className="gpk">{r.label}<span className="gpsrc" style={{ display: "block", fontFamily: "var(--ui)", fontSize: 11, fontWeight: 500, color: "var(--muted)", marginTop: 2 }}>{r.reason}{r.override && `（系統原判：${LV[r.systemLevel]}・${r.override.advisorName ?? "顧問"}調整）`}</span>
                <button className="alink" style={{ padding: 0, marginTop: 3 }} onClick={() => { setEdit(edit === r.key ? null : r.key); setLevel(r.level); setReason(""); setErr(""); }}>{edit === r.key ? "取消改級" : "改級"}</button>
                <Evidence k={r.key} />{/* 跟客戶「我的分析」同一份案例數據（A3b）——顧問面談時可以直接講出處 */}</div>
              <div className="gpv now"><span className="gpl">現在</span><b>{r.current}{r.preliminary && "＊"}</b></div>
              <div className="gpv"><span className="gpl">標準</span><b style={{ color: "var(--brand-ink)" }}>{r.standard ?? "—"}</b></div>
              <div className="gpbar"><i style={{ width: `${r.level === "ok" ? 100 : r.current === "沒有" ? 0 : 50}%`, background: r.level === "ok" ? "var(--brand)" : undefined }} /></div>
              <span className={`lvl ${r.level}`} style={{ justifySelf: "end" }}>{LV[r.level]}</span>
            </div>
            {edit === r.key && (
              <div className="gpr" style={{ display: "flex", flexWrap: "wrap", gap: 7, background: "var(--sunk)" }}>
                {Object.entries(LV).map(([k, t]) => <button key={k} className="lvt" aria-pressed={level === k} onClick={() => setLevel(k)}>{t}</button>)}
                <input className="pta" style={{ marginTop: 0, flex: 1, minWidth: 200, width: "auto" }} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={level === r.systemLevel ? "改回系統原判的理由" : "為什麼改？例：媽媽與阿姨都有乳癌病史"} />
                <button className="abtn pri" disabled={reason.trim().length < 2} onClick={() => save(r.key)}>儲存</button>
                {err && <span className="mtwarn" style={{ flexBasis: "100%" }}>{err}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="acsrc">標＊的是 AI 初步讀取的給付，送規劃書前要在保單審核核過（P4）。改級的理由客戶會看到（標「顧問調整」）。</div>
    </>
  );
}
