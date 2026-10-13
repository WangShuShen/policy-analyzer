"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

/*
 * 顧問申請審核（w1b-03）：放在顧問管理頁最上面，只有待審的申請。
 * 所屬公司、手機只出現在這裡（4-aj：客戶端不顯示顧問所屬公司）；核准只把姓名、登錄字號帶進顧問名單。
 */
interface Application {
  id: string;
  email: string;
  google_name: string | null;
  name: string;
  license_no: string;
  company: string;
  phone: string;
  intro: string;
  created_at: string;
}

export function AdvisorApplications({ onApproved }: { onApproved: () => void }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/admin/advisor-applications?status=pending");
    if (r.ok) setApps((await r.json()).applications);
  }
  useEffect(() => { load(); }, []);

  async function decide(a: Application, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const n = prompt(`退回 ${a.name} 的申請：要告訴申請人原因嗎？（可留空）`);
      if (n === null) return;
      note = n.trim() || undefined;
    } else if (!confirm(`核准 ${a.name}（${a.email}）成為顧問？\n登錄字號：${a.license_no}`)) return;
    setBusy(a.id); setError("");
    const r = await fetch("/api/admin/advisor-applications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, action, note }),
    });
    if (!r.ok) setError((await r.json()).error ?? "處理失敗");
    await load();
    if (r.ok && action === "approve") onApproved();
    setBusy(null);
  }

  if (apps.length === 0) return null;
  return (
    <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm font-semibold text-stone-700">
        待審核的顧問申請（{apps.length}）
        <span className="ml-2 text-xs font-normal text-stone-400">核准前請核對登錄字號；所屬公司與手機只有管理者看得到</span>
      </div>
      {error && <p className="px-4 pt-3 text-red-500 text-xs">{error}</p>}
      {apps.map(a => (
        <div key={a.id} className="px-4 py-3 border-b border-[#DFE4E1]/60 last:border-0 flex gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-1 text-sm">
            <div className="font-medium text-stone-800">{a.name}
              <span className="ml-2 font-mono text-xs text-stone-500">{a.email}</span>
              {a.google_name && a.google_name !== a.name && <span className="ml-2 text-xs text-stone-400">（Google 名稱：{a.google_name}）</span>}
            </div>
            <div className="text-xs text-stone-600">登錄字號 <b>{a.license_no}</b>　·　{a.company}　·　{a.phone}</div>
            <div className="text-xs text-stone-500">「{a.intro}」</div>
            <div className="text-xs text-stone-400">申請時間 {a.created_at} UTC</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button disabled={busy === a.id} onClick={() => decide(a, "approve")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-50" style={{ background: "#2F7A6B" }}>
              <Check className="h-3.5 w-3.5" />核准
            </button>
            <button disabled={busy === a.id} onClick={() => decide(a, "reject")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-50">
              <X className="h-3.5 w-3.5" />退回
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
