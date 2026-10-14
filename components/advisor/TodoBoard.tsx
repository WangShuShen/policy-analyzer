"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TodoItem } from "@/lib/crm/todo";

/*
 * 首頁待辦（原型 SCREENS.advhome 2672，w2-03）。每件可以延後或關掉（⋯ 選單），關掉要選原因——不給出口，待辦會堆成一片紅，新人兩週後就不打開了。
 * 關閉原因存起來，之後就是組織產能儀表板的資料。「提示 · 不用急」不是任務，沒有 ⋯。
 */
const LVC: Record<TodoItem["lv"], string> = { r: "var(--dropped,var(--must))", o: "var(--amber)", y: "#b4972a", g: "var(--brand)", b: "var(--local,#2f7a6b)" };
const GRP: [TodoItem["group"], string][] = [["now", "需要現在處理"], ["week", "這週"], ["hint", "提示 · 不用急"]];
const SNOOZE = ["1 小時後", "今天晚上", "明天", "下週"];
const CLOSE = ["已經處理了", "客戶不回應", "客戶說不需要", "約不到時間", "其他"];
type Handled = { key: string; name: string; title: string; reason: string | null; snoozedUntil: string | null };

const ago = (iso: string) => {
  const t = Date.parse(iso), d = (Date.now() - t) / 3600_000;
  const tw = (ms: number) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
  if (d < 0) return tw(t) === tw(Date.now()) ? "今天" : new Date(t).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
  if (d < 24) return tw(t) === tw(Date.now()) ? `${Math.max(1, Math.round(d))} 小時前` : "昨天";
  return `${Math.round(d / 24)} 天前`;
};
const until = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function TodoBoard({ items, handled, total }: { items: TodoItem[]; handled: Handled[]; total: number }) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".amenu,[data-menu]")) setMenu(null); };
    document.addEventListener("click", close); return () => document.removeEventListener("click", close);
  }, []);
  const act = async (body: object) => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/advisor/todo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); setMenu(null);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error ?? "沒有成功"); return; }
    router.refresh();
  };
  const reasons = [...new Set(handled.map(h => h.reason).filter(Boolean))];
  return (
    <>
      {err && <div className="crm-err" style={{ marginBottom: 12 }}>{err}</div>}
      {GRP.map(([g, label]) => {
        const list = items.filter(x => x.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className={`agrp ag-${g}`}>
            <div className="agh">{label}<span>{list.length}</span></div>
            {list.map(x => (
              <div key={x.key} className="atd">
                <span className="adot" style={{ background: LVC[x.lv] }} />
                <div className="atx"><div className="at1"><b>{x.name}</b>　{x.title}</div><div className="at2">{x.detail}</div></div>
                <div className="ago">{ago(x.at)}</div>
                <div className="aact">
                  <Link className="abtn pri" href={x.href} style={{ textDecoration: "none" }}>{x.act}</Link>
                  {g !== "hint" && <button className="abtn ic" data-menu={x.key} aria-label="延後或關掉" aria-expanded={menu === x.key} onClick={() => setMenu(menu === x.key ? null : x.key)}>⋯</button>}
                </div>
                {menu === x.key && (
                  <div className="amenu" role="menu">
                    <div className="aml">延後到</div>
                    {SNOOZE.map(s => <button key={s} className="ami" role="menuitem" disabled={busy} onClick={() => act({ action: "snooze", key: x.key, option: s })}>{s}</button>)}
                    <div className="aml" style={{ marginTop: 8 }}>關掉，因為</div>
                    {CLOSE.map(c => <button key={c} className="ami" role="menuitem" disabled={busy} onClick={() => act({ action: "dismiss", key: x.key, reason: c })}>{c}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="aempty">
          <svg className="ill i44" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-done" /></svg>
          <div className="aet">今天的事做完了</div>
          <p className="ah2" style={{ marginTop: 6 }}>{total ? <>全部客戶在「<Link href="/clients" style={{ color: "var(--brand-ink)" }}>客戶</Link>」</> : <>還沒有客戶。先到「<Link href="/profile" style={{ color: "var(--brand-ink)" }}>我的顧問頁</Link>」把自我介紹與時段設好，自己談來的客戶可以在「客戶」手動新增</>}</p>
        </div>
      )}
      {handled.length > 0 && (
        <div className="adone">
          已處理 {handled.length} 件{reasons.length ? `　·　關閉原因：${reasons.join("、")}` : ""}
          <details className="crm-handled"><summary className="alink">看明細／還原</summary>
            {handled.map(h => (
              <div key={h.key} className="crm-hrow"><span><b>{h.name}</b>　{h.title}　<span className="ah2">{h.reason ? `關掉：${h.reason}` : h.snoozedUntil ? `延後到 ${until(h.snoozedUntil)}` : ""}</span></span>
                <button className="alink" disabled={busy} onClick={() => act({ action: "restore", key: h.key })}>還原</button></div>
            ))}
          </details>
        </div>
      )}
    </>
  );
}
