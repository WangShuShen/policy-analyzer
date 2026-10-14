"use client";

import { useEffect, useState } from "react";

/*
 * 我的顧問頁（原型 SCREENS.advprofile、B2、B4）。
 * 左邊改欄位、右邊即時看到客戶端的卡片——顧問在意的是客戶看到什麼。
 * 登錄字號由管理者設定（N20），回應速度之後由系統依實際紀錄計算，都不能自己填。
 */
const SPECS = ["家庭保障規劃", "退休與資產規劃", "保單健檢與理賠", "高資產傳承", "小資族規劃"];
const STYLES = ["先把數字算清楚再談", "慢慢來，不急著成交", "用故事和案例說明", "直接講重點不囉嗦"];
const WD = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

interface Rule { weekday: number; start: string; end: string }
interface BlockRange { date: string; start: string; end: string }
interface Profile {
  name: string; specialties: string[]; style: string; intro: string; meetingLink: string; onsiteLocation: string;
  licenseNo: string; rules: Rule[]; blocked: string[]; blockRanges: BlockRange[]; rulesAdjusted?: boolean;
}


export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newBlock, setNewBlock] = useState("");
  const [newRange, setNewRange] = useState<BlockRange>({ date: "", start: "14:00", end: "18:00" });

  useEffect(() => { fetch("/api/advisor/profile").then(r => r.json()).then(setP).catch(() => setMsg({ ok: false, text: "載入失敗" })); }, []);
  if (!p) return <p className="ah2">{msg?.text ?? "載入中…"}</p>;

  const set = (patch: Partial<Profile>) => { setP({ ...p, ...patch }); setMsg(null); };
  const toggleSpec = (s: string) => set({ specialties: p.specialties.includes(s) ? p.specialties.filter(x => x !== s) : p.specialties.length < 2 ? [...p.specialties, s] : p.specialties });
  const setRule = (i: number, patch: Partial<Rule>) => set({ rules: p.rules.map((r, j) => j === i ? { ...r, ...patch } : r) });

  const save = async () => {
    setSaving(true); setMsg(null);
    const r = await fetch("/api/advisor/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "沒存成功" }); return; }
    setP(j); setMsg({ ok: true, text: "已儲存" });
  };

  const missing = [
    !p.licenseNo && "登錄字號（請管理者設定）", !p.intro.trim() && "一句自我介紹", !p.rules.length && "每週可約時段",
    !p.meetingLink.trim() && !p.onsiteLocation.trim() && "線上連結或面對面地點",
  ].filter(Boolean) as string[];

  // 原型 SCREENS.advprofile：左邊改欄位、右邊即時看到客戶端的卡片
  return (
    <>
      {p.rulesAdjusted && <div className="statusline" style={{ marginTop: 0 }}><span className="dotp" /><span>可約時段改規則了：最早 12:00、最晚 22:00、每場 2 小時。你原本的時段已經先幫你調進範圍內，看一下、按「儲存」就生效。</span></div>}
      {missing.length > 0 && <div className="statusline" style={{ marginTop: 0 }}><span className="dotp" /><span>還差 {missing.join("、")}——補齊之前，客戶端的顧問列表不會出現你。</span></div>}
      <div className="profwrap">
        <div className="profedit">
          <div className="pf"><div className="ack">專長領域（最多 2 個）</div>
            <div className="pfo">{SPECS.map(x => <button key={x} type="button" className="lvt" aria-pressed={p.specialties.includes(x)} onClick={() => toggleSpec(x)}>{x}</button>)}</div></div>
          <div className="pf"><div className="ack">諮詢風格</div>
            <div className="pfo">{STYLES.map(x => <button key={x} type="button" className="lvt" aria-pressed={p.style === x} onClick={() => set({ style: x })}>{x}</button>)}</div></div>
          <div className="pf"><div className="ack">一句自我介紹</div>
            <textarea className="pta" maxLength={40} value={p.intro} onChange={e => set({ intro: e.target.value })} />
            <div className="pfhint">{p.intro.length} / 40 字 · 客戶卡片上只放得下一句</div></div>
          <div className="pf"><div className="ack">線上面談連結</div>
            <input className="pta" value={p.meetingLink} placeholder="https://meet.google.com/…" onChange={e => set({ meetingLink: e.target.value })} />
            <div className="pfhint">固定的 Google Meet／Zoom／LINE 通話連結，每次預約自動帶進確認信</div></div>
          <div className="pf"><div className="ack">面對面地點</div>
            <input className="pta" value={p.onsiteLocation} maxLength={100} placeholder="例：台北市信義區○○路○號 1 樓咖啡廳" onChange={e => set({ onsiteLocation: e.target.value })} />
            <div className="pfhint">不接面對面就留空</div></div>
          <div className="pf"><div className="ack">可約時段（台灣時間）</div>
            {p.rules.map((r, i) => (
              <div key={i} className="pfo" style={{ alignItems: "center" }}>
                <select className="pta" style={{ width: "auto", marginTop: 0 }} value={r.weekday} onChange={e => setRule(i, { weekday: Number(e.target.value) })} aria-label="星期">
                  {WD.map((w, k) => <option key={k} value={k}>{w}</option>)}
                </select>
                <input type="time" className="pta" style={{ width: "auto", marginTop: 0 }} value={r.start} step={1800} min="12:00" max="22:00" onChange={e => setRule(i, { start: e.target.value })} aria-label="開始" />
                <span className="pfhint" style={{ marginTop: 0 }}>到</span>
                <input type="time" className="pta" style={{ width: "auto", marginTop: 0 }} value={r.end} step={1800} min="12:00" max="22:00" onChange={e => setRule(i, { end: e.target.value })} aria-label="結束" />
                <button type="button" className="alink" onClick={() => set({ rules: p.rules.filter((_, j) => j !== i) })}>刪除</button>
              </div>
            ))}
            <button type="button" className="alink" style={{ padding: "8px 0 0" }} onClick={() => set({ rules: [...p.rules, { weekday: 1, start: "19:00", end: "22:00" }] })}>＋ 加一個時段</button>
            <div className="pfhint">最早 12:00 開始、最晚 22:00 結束。每場預留 2 小時，兩場之間至少空 30 分鐘；客戶約了 12:00–14:00，下一場最早 14:30</div></div>
          <div className="pf"><div className="ack">封鎖日期</div>
            <div className="pfo" style={{ alignItems: "center" }}>
              {p.blocked.map(d => <button key={d} type="button" className="lvt" onClick={() => set({ blocked: p.blocked.filter(x => x !== d) })} aria-label={`取消封鎖 ${d}`}>{d} ✕</button>)}
              <input type="date" className="pta" style={{ width: "auto", marginTop: 0 }} value={newBlock} onChange={e => setNewBlock(e.target.value)} aria-label="新增封鎖日期" />
              <button type="button" className="alink" disabled={!newBlock} onClick={() => { if (newBlock && !p.blocked.includes(newBlock)) set({ blocked: [...p.blocked, newBlock].sort() }); setNewBlock(""); }}>封鎖這天</button>
            </div>
            <div className="pfhint">請假、已有行程的日子，那天就不開放預約；已經約好的不受影響</div></div>
          <div className="pf"><div className="ack">封鎖時段</div>
            <div className="pfo" style={{ alignItems: "center" }}>
              {p.blockRanges.map((b, i) => <button key={`${b.date}-${b.start}-${i}`} type="button" className="lvt" onClick={() => set({ blockRanges: p.blockRanges.filter((_, j) => j !== i) })} aria-label={`取消封鎖 ${b.date} ${b.start}–${b.end}`}>{b.date} {b.start}–{b.end} ✕</button>)}
            </div>
            <div className="pfo" style={{ alignItems: "center" }}>
              <input type="date" className="pta" style={{ width: "auto", marginTop: 0 }} value={newRange.date} onChange={e => setNewRange({ ...newRange, date: e.target.value })} aria-label="封鎖哪一天" />
              <input type="time" className="pta" style={{ width: "auto", marginTop: 0 }} value={newRange.start} step={1800} onChange={e => setNewRange({ ...newRange, start: e.target.value })} aria-label="封鎖開始" />
              <span className="pfhint" style={{ marginTop: 0 }}>到</span>
              <input type="time" className="pta" style={{ width: "auto", marginTop: 0 }} value={newRange.end} step={1800} onChange={e => setNewRange({ ...newRange, end: e.target.value })} aria-label="封鎖結束" />
              <button type="button" className="alink" disabled={!newRange.date || !newRange.start || !newRange.end || newRange.start >= newRange.end}
                onClick={() => { set({ blockRanges: [...p.blockRanges, newRange].sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)) }); setNewRange({ ...newRange, date: "" }); }}>封鎖這段</button>
            </div>
            <div className="pfhint">某天只有一段時間不行（例如 10/20 14:00–18:00），那段時間碰到的場次就不開放；記得按下面的「儲存」</div></div>
          <div className="pf lock"><div className="ack">回應速度</div>
            <div className="pfro">新加入　<span className="pfhint">系統依實際回覆紀錄自動計算，不能自己填</span></div></div>
          <div className="pf lock"><div className="ack">登錄字號</div>
            <div className="pfro">{p.licenseNo || "未設定"}　<span className="pfhint">由管理者設定</span></div></div>
          <div className="acnext" style={{ marginTop: 6 }}>
            <button type="button" className="abtn pri big" onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
            {msg && <span className={msg.ok ? "mtok" : "mtwarn"}>{msg.text}</span>}
          </div>
        </div>
        <div className="profprev">
          <div className="ppl">客戶看到的樣子</div>
          <div className="adv" style={{ cursor: "default" }}>
            <div className="hd"><div className="ava">{p.name.slice(0, 1)}</div>
              <div><div className="nm">{p.name}</div><div className="sp">{p.specialties.length ? `擅長${p.specialties.join("、")}` : "保險顧問"}</div></div></div>
            <div className="quote">「{p.intro || "—"}」</div>
            <div className="advmeta">
              <span className="chip hot">新加入</span>
              <span className="chip">{p.rules.length ? "這週可約" : "未設定時段"}</span>
              <span className="chip">{p.meetingLink && p.onsiteLocation ? "線上或面對面" : p.meetingLink ? "只接線上" : p.onsiteLocation ? "面對面" : "未設定面談方式"}</span>
              <span className="chip">{p.style}</span>
            </div>
          </div>
          <div className="pfhint" style={{ marginTop: 10 }}>卡片刻意不放年資與成交件數——新人拚得過的是回應速度、可約時段和諮詢風格。</div>
        </div>
      </div>
    </>
  );
}
