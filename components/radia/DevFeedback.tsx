"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/*
 * 開發版回饋鈕（卡 A 第 4 步，協作規則 §7）：每頁右下角一顆，按了跳出小框。
 * 類型＋一句說明；網址、登入身分、時間自動帶上。
 * 只在開發版出現：載入時問 /api/dev/feedback?probe=1，上線版回 404 → 整顆不渲染。
 */
const KINDS: [string, string][] = [["broken", "壞掉了"], ["not_wanted", "不是我要的"], ["wording", "文字要改"], ["idea", "想法"]];
const ROLE: Record<string, string> = { customer: "客戶", advisor: "顧問", admin: "管理者", guest: "未登入" };

export function DevFeedback() {
  const path = usePathname();
  const [me, setMe] = useState<{ role: string; name: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("broken");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 底部動作列（.foot）在手機上固定在畫面底部、高度依頁面而定 → 量出來，回饋鈕放在它上面，不擋按鈕
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!me) return;
    const foot = document.querySelector<HTMLElement>(".rd .foot");
    if (!foot) return;
    const measure = () => {
      const r = foot.getBoundingClientRect(), shown = getComputedStyle(foot).display !== "none" && r.height > 0 && r.top < window.innerHeight;
      setLift(shown ? Math.max(0, window.innerHeight - r.top) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(foot);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [me, path]);

  useEffect(() => {
    fetch("/api/dev/feedback?probe=1").then(r => r.ok ? r.json() : null).then(d => setMe(d?.enabled ? d : null)).catch(() => setMe(null));
  }, [path]);
  if (!me) return null;

  const url = typeof window === "undefined" ? path : window.location.pathname + window.location.search;
  const send = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/dev/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, body, pageUrl: url }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setMsg({ ok: false, text: j.error ?? "沒有送出去，請再試一次" }); return; }
    setBody(""); setMsg({ ok: true, text: `已送出（#${j.seq}），謝謝！處理進度看「回饋清單」。` });
  };

  return (
    <>
      <button className="rd-fbbtn" style={lift ? { bottom: lift + 12 } : undefined} onClick={() => { setOpen(!open); setMsg(null); }} aria-expanded={open} aria-label="回饋（開發版）">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <span>回饋</span>
      </button>
      {open && (
        <div className="rd-fbbox" style={lift ? { bottom: lift + 60 } : undefined} role="dialog" aria-label="送出回饋">
          <div className="rd-fbhd"><b>開發版回饋</b><button onClick={() => setOpen(false)} aria-label="關閉">×</button></div>
          <div className="rd-fbkinds" role="radiogroup" aria-label="類型">
            {KINDS.map(([k, l]) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          <textarea id="rd-fb-body" value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={2000}
            placeholder="我在這頁看到＿＿／我想要＿＿／因為＿＿（可以加一句「像原型的＿＿」）" />
          <div className="rd-fbmeta">會自動附上：{url}　·　{ROLE[me.role] ?? me.role}{me.name ? `（${me.name}）` : ""}　·　送出時間</div>
          {msg && <div className={msg.ok ? "rd-fbok" : "rd-err"} style={{ margin: 0 }}>{msg.text}</div>}
          <div className="rd-fbact">
            {me.role !== "guest" && <a href="/dev/feedback">回饋清單</a>}
            <button className="rd-fbsend" disabled={busy || !body.trim()} onClick={send}>{busy ? "送出中…" : "送出"}</button>
          </div>
        </div>
      )}
    </>
  );
}
