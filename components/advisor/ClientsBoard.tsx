"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRow } from "@/lib/advisor/clients";
import { toTaipei } from "@/lib/booking/slots";

/*
 * 客戶清單（原型 SCREENS.advclients 3383）。按狀態分組，不做大表格——新人一年二三十個客戶，不需要篩選排序。
 * 分組照原型：等我處理／進行中／已成交／沒成（沒成預設收合，但不刪——沒成的原因是資料）。
 * W2：搜尋姓名、＋手動新增客戶（4-f；要勾已取得客戶同意，4-aq）、來源與最後動作是真的。
 */
const GROUPS: [string, string, ClientRow["group"][], string][] = [
  ["todo", "等我處理", ["todo"], "var(--dropped,var(--must))"], ["doing", "進行中", ["upcoming", "met"], "var(--brand)"],
  ["won", "已成交", ["won"], "var(--good,#0ca30c)"], ["lost", "沒成", ["lost", "closed"], "var(--muted)"],
];
// now 由伺服器傳進來、日期自己排版：用瀏覽器的 Date.now／toLocaleDateString 會跟伺服器算的不一樣 → React #418（10/15 #3）
const md = (t: number) => { const [, m, d] = toTaipei(t).date.split("-").map(Number); return `${m}/${d}`; };
const ago = (s: string, now: number) => {
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00+08:00` : s.replace(" ", "T") + (s.includes("T") || s.endsWith("Z") ? "" : "Z"));
  const d = (now - t) / 86400e3;
  if (d < 0) return md(t);
  if (d < 1) return "今天";
  if (d < 2) return "昨天";
  if (d < 30) return `${Math.floor(d)} 天前`;
  return md(t);
};

export function ClientsBoard({ rows, newThisMonth, now }: { rows: ClientRow[]; newThisMonth: number; now: number }) {
  const [q, setQ] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = q.trim() ? rows.filter(r => r.name.includes(q.trim())) : rows;
  return (
    <>
      <div className="acbar">
        <input type="search" className="asrch" placeholder="搜尋姓名…" value={q} onChange={e => setQ(e.target.value)} aria-label="搜尋姓名" />
        <button className="abtn pri" onClick={() => setAdding(true)}>＋ 手動新增客戶</button>
        <span className="ah2" style={{ marginLeft: "auto" }}>{rows.length} 位 · 本月新增 {newThisMonth} 位</span>
      </div>
      {adding && <NewClient onClose={() => setAdding(false)} />}
      {rows.length === 0 && !adding && (
        <div className="aempty"><div className="aet">還沒有客戶</div>
          <p className="ah2" style={{ marginTop: 6 }}>平台上預約你的客戶會自動出現在這裡；自己談來的客戶按「＋ 手動新增客戶」。<br />也記得到「<Link href="/profile" style={{ color: "var(--brand-ink)" }}>我的顧問頁</Link>」把自我介紹與時段設好。</p></div>
      )}
      {rows.length > 0 && !list.length && <div className="aempty"><div className="aet">找不到「{q}」</div></div>}
      {GROUPS.map(([k, label, gs, dot]) => {
        const items = list.filter(r => gs.includes(r.group));
        if (!items.length) return null;
        const fold = k === "lost" && !lostOpen && !q.trim();
        return (
          <div key={k} className="agrp">
            <div className="agh">{label}<span>{items.length}</span>{k === "lost" && <button className="alink" onClick={() => setLostOpen(!lostOpen)}>{fold ? "展開" : "收合"}</button>}</div>
            {!fold && items.map(c => (
              <div key={c.userId} className="atd">
                <span className="adot" style={{ background: dot }} />
                <div className="atx"><div className="at1"><b>{c.name}</b>　{c.status}</div>
                  {c.followUpOn && c.group !== "won" && c.group !== "lost" && <div className="at2">下次追蹤 {c.followUpOn.slice(5).replace("-", "/")}{c.followUpNote ? `：${c.followUpNote}` : ""}</div>}</div>
                <span className="asrc">{c.source}</span>
                <div className="ago">{ago(c.lastAt, now)}</div>
                <Link className="abtn" href={`/clients/${c.userId}`} style={{ textDecoration: "none" }}>開客戶頁</Link>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function NewClient({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/advisor/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone: phone || null, note: note || null, consent }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有建立成功"); return; }
    router.push(`/clients/${j.userId}`);
  };
  return (
    <div className="ccc crm-new">
      <div className="ccb" style={{ fontSize: 15 }}>手動新增客戶（自己談來的）</div>
      <div className="crm-f"><label>姓名 <b>必填</b></label><input className="crm-in" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="例：陳小姐" /></div>
      <div className="crm-f"><label>電話</label><input className="crm-in" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} placeholder="例：0912-345-678" inputMode="tel" /></div>
      <div className="crm-f"><label>備註</label><textarea className="crm-in" rows={2} value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="例：同事介紹，想看小孩的保障" /></div>
      <label className="crm-consent">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span><b>我已取得客戶同意，將他的保單資料提供給 RADIA 分析</b><small>勾選會記下你的名字和時間（個資法 N4、N21）。沒有取得同意，請不要上傳他的保單。</small></span>
      </label>
      {err && <div className="crm-err">{err}</div>}
      <div className="crm-acts"><button className="abtn" onClick={onClose} disabled={busy}>取消</button>
        <button className="abtn pri" disabled={busy || !name.trim() || !consent} onClick={save}>{busy ? "建立中…" : "建立客戶"}</button></div>
    </div>
  );
}
