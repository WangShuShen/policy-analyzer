"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

/*
 * 後台監控（w1b-04、w1b-05、C8）：誰在線、登入紀錄、AI 用量與費用、警報門檻。
 * 樣式沿用其他管理頁（Tailwind 後台樣式）；圖只有一張「最近 30 天每日費用」單色長條，滑過看數字，下面附表格。
 */
interface Online { id: string; role: string; isAdmin: boolean; name: string | null; path: string | null; lastSeen: string; since: string }
interface Login { id: number; actorId: string; role: string; email: string | null; method: string; ip: string | null; userAgent: string | null; at: string }
interface Usage {
  today: string; month: string; todayUsd: number; todayCalls: number; monthUsd: number; monthCalls: number;
  thresholds: { monthlyBudgetUsd: number; userDailyUsd: number };
  daily: { day: string; usd: number; calls: number }[];
  byModel: { model: string; usd: number; calls: number; tokensIn: number; tokensOut: number }[];
  topUsersToday: { userId: string; name: string; usd: number; calls: number; over: boolean }[];
  alerts: { kind: string; period: string; userId: string; usd: number; thresholdUsd: number; at: string }[];
  blockedToday: number;
}

const BRAND = "#2F7A6B";
const card = "bg-white border border-[#DFE4E1] rounded-2xl shadow-sm";
const th = "text-left px-4 py-2.5 text-xs font-semibold text-stone-500";
const td = "px-4 py-2 text-stone-700";
const money = (u: number) => `$${u < 1 ? u.toFixed(3) : u.toFixed(2)}`;
const ago = (iso: string) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 60 ? "剛剛" : s < 3600 ? `${Math.floor(s / 60)} 分鐘前` : `${Math.floor(s / 3600)} 小時前`; };
const taipei = (utc: string) => new Date(utc.includes("T") ? utc : `${utc.replace(" ", "T")}Z`).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const device = (ua: string | null) => !ua ? "—" : /iPhone|Android.*Mobile/.test(ua) ? "手機" : /iPad|Android/.test(ua) ? "平板" : "電腦";

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${warn ? "text-red-600" : "text-stone-800"}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
    </div>
  );
}

function DailyBars({ usage }: { usage: Usage }) {
  // 補滿 30 天（沒用量的日子也要有位置），由舊到新
  const days: { day: string; usd: number; calls: number }[] = [];
  const map = new Map(usage.daily.map(d => [d.day, d]));
  const end = Date.parse(`${usage.today}T00:00:00Z`);
  for (let i = 29; i >= 0; i--) { const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10); days.push(map.get(day) ?? { day, usd: 0, calls: 0 }); }
  const max = Math.max(...days.map(d => d.usd), 0.0001);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? days[hover] : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-stone-700">最近 30 天每日 AI 費用（美元，台灣日期）</div>
        <div className="text-xs text-stone-500 h-4">{h ? `${h.day}：${money(h.usd)}・${h.calls} 次呼叫` : `最高一天 ${money(max)}`}</div>
      </div>
      <div className="relative h-32 flex items-end gap-[2px] border-b border-stone-200" role="img" aria-label="最近 30 天每日 AI 費用長條圖，數字見下方表格">
        {days.map((d, i) => (
          <div key={d.day} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-full rounded-t-[4px]" style={{ height: d.usd ? `${Math.max(2, (d.usd / max) * 100)}%` : 0, background: BRAND, opacity: hover === null || hover === i ? 1 : 0.45 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-stone-400 mt-1"><span>{days[0].day.slice(5)}</span><span>今天</span></div>
      <details className="mt-2">
        <summary className="text-xs text-stone-500 cursor-pointer">看表格</summary>
        <table className="w-full text-xs mt-2">
          <thead><tr><th className={th}>日期</th><th className={th}>費用</th><th className={th}>AI 呼叫</th></tr></thead>
          <tbody>{[...days].reverse().filter(d => d.calls).map(d => <tr key={d.day}><td className={td}>{d.day}</td><td className={td}>{money(d.usd)}</td><td className={td}>{d.calls}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

function ThresholdEditor({ value, onSaved }: { value: Usage["thresholds"]; onSaved: () => void }) {
  const [v, setV] = useState({ m: String(value.monthlyBudgetUsd), d: String(value.userDailyUsd) });
  const [msg, setMsg] = useState("");
  const save = async () => {
    const r = await fetch("/api/admin/monitor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthlyBudgetUsd: Number(v.m), userDailyUsd: Number(v.d) }) });
    setMsg(r.ok ? "已儲存" : (await r.json()).error ?? "儲存失敗");
    if (r.ok) onSaved();
  };
  const inp = "w-24 bg-[#F6F8F6] border border-[#CDD6D2] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#2F7A6B]";
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
      <label>每月預算 $<input className={inp} inputMode="decimal" value={v.m} onChange={e => setV({ ...v, m: e.target.value })} /></label>
      <label title="超過就暫停這個人今天的 AI（明天 0 點恢復），同時通知管理者">每人每天上限 $<input className={inp} inputMode="decimal" value={v.d} onChange={e => setV({ ...v, d: e.target.value })} /></label>
      <button onClick={save} className="px-3 py-1.5 rounded-xl text-xs font-medium text-white" style={{ background: BRAND }}>儲存門檻</button>
      {msg && <span className="text-xs text-stone-400">{msg}</span>}
    </div>
  );
}

export default function MonitorPage() {
  const [d, setD] = useState<{ online: Online[]; logins: Login[]; usage: Usage } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const r = await fetch("/api/admin/monitor");
    if (r.ok) setD(await r.json());
    setBusy(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  if (!d) return <p className="p-6 text-sm text-stone-400"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />載入中…</p>;
  const u = d.usage, budgetPct = u.monthUsd / u.thresholds.monthlyBudgetUsd;
  const advisorsOnline = d.online.filter(o => o.role === "advisor").length;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-400">每分鐘自動更新。費用含 AI 諮詢的每一輪與合規審查；衛教模式不記錄（N22）。</p>
        <button onClick={load} disabled={busy} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />重新整理</button>
      </div>

      {u.alerts.some(a => a.kind !== "user_blocked" && (a.period === u.month || a.period === u.today)) && (
        <div className="flex gap-2 items-start rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{u.alerts.filter(a => a.kind !== "user_blocked" && (a.period === u.month || a.period === u.today)).map((a, i) => (
            <div key={i}>{a.kind === "monthly_budget" ? `本月費用 ${money(a.usd)} 超過預算 ${money(a.thresholdUsd)}` : `有使用者今天用了 ${money(a.usd)}，超過每人每天上限 ${money(a.thresholdUsd)}`}</div>
          ))}<div className="text-xs text-red-500 mt-1">超過每人上限的，今天的 AI 已先暫停（N7），明天 0 點自動恢復。</div></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="現在在線" value={`${d.online.length} 人`} sub={`顧問 ${advisorsOnline}・客戶 ${d.online.length - advisorsOnline}`} />
        <Tile label="今天 AI 費用" value={money(u.todayUsd)} warn={u.blockedToday > 0}
          sub={`${u.todayCalls} 次呼叫・今天被暫停 ${u.blockedToday} 人`} />
        <Tile label={`${u.month} 累計`} value={money(u.monthUsd)} warn={budgetPct > 1}
          sub={<span>預算 {money(u.thresholds.monthlyBudgetUsd)}・用了 {Math.round(budgetPct * 100)}%</span>} />
        <Tile label="本月 AI 呼叫" value={`${u.monthCalls} 次`} sub={u.monthCalls ? `平均每次 ${money(u.monthUsd / u.monthCalls)}` : "—"} />
      </div>

      <div className={`${card} p-5`}><DailyBars usage={u} /></div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#DFE4E1] text-sm font-semibold text-stone-700">現在在線（5 分鐘內有動作）</div>
          {d.online.length === 0 ? <p className="p-4 text-sm text-stone-400">目前沒有人在線。</p> : (
            <table className="w-full text-sm"><tbody>
              {d.online.map(o => (
                <tr key={o.id} className="border-b border-[#DFE4E1]/60 last:border-0">
                  <td className={td}>{o.name ?? o.id}<span className="ml-1 text-xs text-stone-400">{o.role === "advisor" ? (o.isAdmin ? "管理者" : "顧問") : "客戶"}</span></td>
                  <td className={`${td} text-xs text-stone-500 font-mono`}>{o.path ?? ""}</td>
                  <td className={`${td} text-xs text-stone-400 text-right whitespace-nowrap`}>{ago(o.lastSeen)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-[#DFE4E1] text-sm font-semibold text-stone-700">今天用最多的使用者</div>
          {u.topUsersToday.length === 0 ? <p className="p-4 text-sm text-stone-400">今天還沒有 AI 用量。</p> : (
            <table className="w-full text-sm"><tbody>
              {u.topUsersToday.map(t => (
                <tr key={t.userId} className="border-b border-[#DFE4E1]/60 last:border-0">
                  <td className={td}>{t.name}{t.over && <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-red-600"><AlertTriangle className="h-3 w-3" />已暫停 AI</span>}</td>
                  <td className={`${td} text-right`}>{money(t.usd)}</td>
                  <td className={`${td} text-right text-xs text-stone-400`}>{t.calls} 次</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      <div className={`${card} p-5 space-y-3`}>
        <div className="text-sm font-semibold text-stone-700">警報門檻</div>
        <p className="text-xs text-stone-400">超過就在通知鈴和信箱通知所有管理者；同一個月（或同一人同一天）只通知一次。目前是觀察期，不會擋住使用者（I6）。</p>
        <ThresholdEditor key={JSON.stringify(u.thresholds)} value={u.thresholds} onSaved={load} />
        {u.byModel.length > 0 && (
          <table className="w-full text-xs mt-2">
            <thead><tr><th className={th}>本月各模型</th><th className={th}>費用</th><th className={th}>呼叫</th><th className={th}>tokens 進／出</th></tr></thead>
            <tbody>{u.byModel.map(m => <tr key={m.model}><td className={td}>{m.model}</td><td className={td}>{money(m.usd)}</td><td className={td}>{m.calls}</td><td className={td}>{m.tokensIn.toLocaleString()}／{m.tokensOut.toLocaleString()}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[#DFE4E1] text-sm font-semibold text-stone-700">最近登入（100 筆）</div>
        {d.logins.length === 0 ? <p className="p-4 text-sm text-stone-400">還沒有登入紀錄。</p> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-[#E2EFEB]/50"><th className={th}>時間（台灣）</th><th className={th}>帳號</th><th className={th}>身分</th><th className={th}>方式</th><th className={th}>裝置</th><th className={th}>IP</th></tr></thead>
            <tbody>{d.logins.map(l => (
              <tr key={l.id} className="border-b border-[#DFE4E1]/60 last:border-0">
                <td className={`${td} text-xs font-mono text-stone-500 whitespace-nowrap`}>{taipei(l.at)}</td>
                <td className={`${td} text-xs`}>{l.email ?? l.actorId}</td>
                <td className={`${td} text-xs`}>{l.role === "advisor" ? "顧問" : "客戶"}</td>
                <td className={`${td} text-xs`}>{l.method === "google" ? "Google" : "測試登入"}</td>
                <td className={`${td} text-xs`} title={l.userAgent ?? ""}>{device(l.userAgent)}</td>
                <td className={`${td} text-xs font-mono text-stone-400`}>{l.ip ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
