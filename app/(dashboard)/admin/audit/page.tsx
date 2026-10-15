"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

/*
 * 查閱紀錄（w1b-07、N12）：誰在何時看了哪位客戶的哪一類資料。
 * 只有軌跡、沒有個案內容；管理者打開這頁本身也會記一筆。
 */
interface Row {
  id: number; at: string; actorId: string; actorName: string | null; actorRole: string;
  action: string; actionLabel: string; userId: string | null; userName: string | null; targetType: string | null; targetId: string | null;
}
interface Advisor { id: string; name: string }

// 資料庫存 UTC "YYYY-MM-DD HH:MM:SS" → 台灣時間
const taipei = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

const input = "bg-[#F6F8F6] border border-[#CDD6D2] rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-[#2F7A6B]";

export default function AuditPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [f, setF] = useState({ actor: "", action: "", from: "", to: "" });
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRows(null); setError("");
    const q = new URLSearchParams({ ...f, user: user?.id ?? "" });
    const r = await fetch(`/api/admin/audit?${q}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "讀取失敗"); setRows([]); return; }
    setRows(d.rows); setActions(d.actions);
  }, [f, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/admin/advisors").then(r => r.ok ? r.json() : null).then(d => d && setAdvisors(d.advisors)); }, []);

  return (
    <div className="max-w-5xl space-y-5">
      <p className="text-sm text-stone-400">顧問每次打開客戶頁、諮詢紀錄、保障分析，以及標記與改級，都會留一筆。這裡只有軌跡，看不到個案內容（N12）。</p>

      <div className="flex flex-wrap gap-2 items-center">
        <select className={input} value={f.actor} onChange={e => setF({ ...f, actor: e.target.value })} aria-label="誰">
          <option value="">所有人</option>
          {advisors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={input} value={f.action} onChange={e => setF({ ...f, action: e.target.value })} aria-label="做了什麼">
          <option value="">所有動作</option>
          {Object.entries(actions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" className={input} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} aria-label="從" />
        <span className="text-stone-400 text-sm">到</span>
        <input type="date" className={input} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} aria-label="到" />
        {user && (
          <button onClick={() => setUser(null)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs bg-[#E2EFEB] text-stone-700">
            只看客戶：{user.name}<X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div className="bg-white border border-[#DFE4E1] rounded-2xl shadow-sm overflow-hidden">
        {rows === null ? (
          <p className="p-6 text-sm text-stone-400 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />載入中…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-stone-400 text-center">這個條件下沒有紀錄。</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#DFE4E1] bg-[#E2EFEB]/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">時間（台灣）</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">誰</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">做了什麼</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">客戶</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-[#DFE4E1]/60 last:border-0">
                  <td className="px-4 py-2.5 text-stone-500 font-mono text-xs whitespace-nowrap">{taipei(r.at)}</td>
                  <td className="px-4 py-2.5 text-stone-800">{r.actorName ?? r.actorId}{r.actorRole === "admin" && <span className="ml-1 text-xs text-amber-600">管理者</span>}</td>
                  <td className="px-4 py-2.5 text-stone-700">{r.actionLabel}</td>
                  <td className="px-4 py-2.5">
                    {r.userId ? (
                      <button onClick={() => setUser({ id: r.userId!, name: r.userName ?? r.userId! })} className="text-[#2F7A6B] hover:underline" title="只看這位客戶的紀錄">
                        {r.userName ?? r.userId}
                      </button>
                    ) : <span className="text-stone-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {rows && rows.length >= 200 && <p className="text-xs text-stone-400">只列最新 200 筆，請用上面的條件縮小範圍。</p>}
    </div>
  );
}
