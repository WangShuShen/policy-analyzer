"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Database, ClipboardCheck,
  ChevronRight, LogOut, Users, BarChart2,
  PanelLeft, PanelLeftClose,
} from "lucide-react";
import { useReviewCount } from "@/components/ReviewView";

function SidebarNav({ onNavigate, onCollapse }: { onNavigate: () => void; onCollapse: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const reviewCount = useReviewCount();
  const [iconError, setIconError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.isAdmin) setIsAdmin(true);
    }).catch(() => {});
  }, []);

  const navItems = [
    { href: "/analyze", icon: <LayoutDashboard className="h-4 w-4" />, label: "保單分析" },
    { href: "/catalog", icon: <Database className="h-4 w-4" />, label: "商品查詢" },
    { href: "/review", icon: <ClipboardCheck className="h-4 w-4" />, label: "保單審核", badge: reviewCount },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

  const linkClass = (active: boolean) =>
    `w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 group ${
      active ? "bg-[#FBF0E3] text-[#8B5E3C] font-semibold" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
    }`;

  return (
    <div className="h-full w-56 bg-white border-r border-[#EDE0CE] flex flex-col shadow-sm">
      <div className="px-5 py-5 border-b border-[#EDE0CE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden bg-amber-50 flex items-center justify-center shrink-0">
            {iconError ? (
              <span className="text-xl">🏠</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand-icon.png" alt="傳家知保" className="w-10 h-10 object-cover" onError={() => setIconError(true)} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-stone-800 leading-tight" style={{ fontFamily: "var(--font-serif-tc), serif" }}>
              傳家知保
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">保單分析工具</div>
          </div>
          <button onClick={onCollapse} className="ml-auto p-1 text-stone-300 hover:text-stone-600 transition-colors" title="收合側邊欄">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider px-3 pt-2 pb-1">功能選單</p>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(active)}>
              <span className={active ? "text-[#C8956C]" : "text-stone-400 group-hover:text-stone-500"}>{item.icon}</span>
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-white leading-none">{item.badge}</span>
              )}
              {active && !(item.badge && item.badge > 0) && <ChevronRight className="h-3 w-3 ml-auto text-[#C8956C]" />}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider px-3 pt-4 pb-1">管理</p>
            {[
              { href: "/admin/advisors", icon: <Users className="h-4 w-4" />, label: "顧問管理" },
              { href: "/admin/progress", icon: <BarChart2 className="h-4 w-4" />, label: "今日進度" },
            ].map(item => (
              <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClass(isActive(item.href))}>
                <span className={isActive(item.href) ? "text-[#C8956C]" : "text-stone-400 group-hover:text-stone-500"}>{item.icon}</span>
                {item.label}
                {isActive(item.href) && <ChevronRight className="h-3 w-3 ml-auto text-[#C8956C]" />}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-[#EDE0CE]">
        <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 rounded-xl text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center gap-2 transition-all">
          <LogOut className="h-3.5 w-3.5" />
          登出系統
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  // 預設：桌機展開、窄螢幕收起
  useEffect(() => {
    setOpen(window.innerWidth >= 768);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.985 0.012 75)" }}>
      {/* 行動裝置遮罩 */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* 側邊欄：桌機收合改變寬度、行動裝置浮層滑入 */}
      <aside
        className={`fixed md:relative z-40 h-full shrink-0 transform transition-all duration-200 ${
          open ? "translate-x-0 w-56" : "-translate-x-full w-56 md:translate-x-0 md:w-0 md:overflow-hidden"
        }`}
      >
        <SidebarNav
          onNavigate={() => { if (typeof window !== "undefined" && window.innerWidth < 768) setOpen(false); }}
          onCollapse={() => setOpen(false)}
        />
      </aside>

      {/* 展開按鈕（收合時顯示）*/}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-white border border-[#EDE0CE] shadow-sm text-stone-500 hover:text-[#8B5E3C] transition-colors"
          title="展開側邊欄"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
