"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";

interface Advisor {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  is_active: number;
  created_at: string;
}

export default function AdvisorsPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/advisors");
    if (res.ok) {
      const data = await res.json();
      setAdvisors(data.advisors);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addAdvisor(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    const res = await fetch("/api/admin/advisors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, name: newName, is_admin: newIsAdmin }),
    });
    if (res.ok) {
      setNewEmail(""); setNewName(""); setNewIsAdmin(false); setShowAdd(false);
      await load();
    } else {
      const d = await res.json();
      setError(d.error ?? "新增失敗");
    }
    setAdding(false);
  }

  async function toggle(id: string, field: "is_active" | "is_admin", currentVal: number) {
    await fetch("/api/admin/advisors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: currentVal === 0 }),
    });
    await load();
  }

  async function removeAdvisor(id: string) {
    if (!confirm("確定要刪除這位顧問嗎？")) return;
    await fetch("/api/admin/advisors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-800">顧問名單管理</h1>
          <p className="text-sm text-stone-400 mt-0.5">僅名單內的 Google 帳號才可登入系統</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
        >
          <Plus className="h-4 w-4" />新增顧問
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addAdvisor} className="bg-white border border-[#EDE0CE] rounded-2xl p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-700">新增顧問</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-stone-500">Google 信箱</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="advisor@gmail.com"
                className="w-full bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-[#C8956C]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-stone-500">顧問姓名</label>
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="王小明"
                className="w-full bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-[#C8956C]"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={e => setNewIsAdmin(e.target.checked)}
              className="rounded"
            />
            設為管理者（可管理顧問名單）
          </label>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-stone-500 hover:bg-stone-100 rounded-xl"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
            >
              {adding ? "新增中…" : "新增"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#EDE0CE] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-stone-400 text-center">載入中…</p>
        ) : advisors.length === 0 ? (
          <p className="p-6 text-sm text-stone-400 text-center">
            尚未新增任何顧問。點擊右上角「新增顧問」開始。
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EDE0CE] bg-[#FBF0E3]/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">姓名</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500">Google 信箱</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-stone-500">管理者</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-stone-500">狀態</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {advisors.map((a, i) => (
                <tr
                  key={a.id}
                  className={`border-b border-[#EDE0CE]/60 last:border-0 ${a.is_active === 0 ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-stone-800">{a.name}</td>
                  <td className="px-4 py-3 text-stone-500 font-mono text-xs">{a.email}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggle(a.id, "is_admin", a.is_admin)}
                      title={a.is_admin ? "點擊取消管理者" : "點擊設為管理者"}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-stone-100 transition-colors"
                    >
                      {a.is_admin ? (
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                      ) : (
                        <ShieldOff className="h-4 w-4 text-stone-300" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggle(a.id, "is_active", a.is_active)}
                      title={a.is_active ? "點擊停用" : "點擊啟用"}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                      style={{
                        background: a.is_active ? "#D1FAE5" : "#FEE2E2",
                        color: a.is_active ? "#065F46" : "#991B1B",
                      }}
                    >
                      {a.is_active ? (
                        <><UserCheck className="h-3 w-3" />啟用</>
                      ) : (
                        <><UserX className="h-3 w-3" />停用</>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeAdvisor(a.id)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-50 text-stone-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-stone-400">
        共 {advisors.filter(a => a.is_active).length} 位啟用中 / {advisors.length} 位顧問
      </p>
    </div>
  );
}
