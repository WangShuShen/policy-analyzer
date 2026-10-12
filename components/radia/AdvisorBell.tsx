"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Notice } from "@/lib/notify/inbox";

/*
 * 顧問的站內通知（W1b）：新預約、改期、取消、存摺上傳好了、明天面談。
 * 原型沒有這個元件；用原型的 cacc／rd-menu 樣式組成。每分鐘、換頁時更新一次。
 */
const ago = (s: string) => {
  const t = Date.parse(s.includes("T") ? s : s.replace(" ", "T") + "Z"), m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
};

export function AdvisorBell() {
  const router = useRouter(), path = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notice[]; unread: number }>({ items: [], unread: 0 });
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => { fetch("/api/advisor/notifications").then(r => r.ok ? r.json() : null).then(d => d && setData(d)).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load, path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const read = async (ids?: string[]) => {
    await fetch("/api/advisor/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) }).catch(() => {});
    load();
  };
  const go = (n: Notice) => { setOpen(false); if (!n.read) read([n.id]); if (n.link) router.push(n.link); };

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="cacc rd-bell" aria-label={data.unread ? `通知（${data.unread} 則未讀）` : "通知"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        {data.unread > 0 && <span className="rd-badge">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="rd-menu rd-notices" role="dialog" aria-label="通知">
          <div className="rd-nhd"><b>通知</b>{data.unread > 0 && <button onClick={() => read()}>全部標為已讀</button>}</div>
          {data.items.length === 0 ? <div className="rd-nempty">還沒有通知。有新預約、改期或取消時會出現在這裡。</div> : data.items.map(n => (
            <button key={n.id} className={`rd-nitem ${n.read ? "" : "unread"}`} onClick={() => go(n)}>
              <span className="rd-nt">{n.title}</span>
              {n.body && <span className="rd-nb">{n.body}</span>}
              <span className="rd-nd">{ago(n.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
