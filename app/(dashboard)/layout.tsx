"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Database, ClockIcon, ClipboardCheck,
  ChevronRight, LogOut, Users,
} from "lucide-react";
import { useReviewCount } from "@/components/ReviewView";

function SidebarNav() {
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
    { href: "/history", icon: <ClockIcon className="h-4 w-4" />, label: "歷史紀錄" },
    { href: "/review", icon: <ClipboardCheck className="h-4 w-4" />, label: "保單審核", badge: reviewCount },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

  return (
    <aside className="w-56 bg-white border-r border-[#EDE0CE] flex flex-col shrink-0 shadow-sm">
      <div className="px-5 py-5 border-b border-[#EDE0CE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden bg-amber-50 flex items-center justify-center shrink-0">
            {iconError ? (
              <span className="text-xl">🏠</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/brand-icon.png"
                alt="傳家知保"
                className="w-10 h-10 object-cover"
                onError={() => setIconError(true)}
              />
            )}
          </div>
          <div>
            <div
              className="text-base font-bold text-stone-800 leading-tight"
              style={{ fontFamily: "var(--font-serif-tc), serif" }}
            >
              傳家知保
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">保單分析工具</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider px-3 pt-2 pb-1">
          功能選單
        </p>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 group ${
                active
                  ? "bg-[#FBF0E3] text-[#8B5E3C] font-semibold"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
              }`}
            >
              <span
                className={
                  active ? "text-[#C8956C]" : "text-stone-400 group-hover:text-stone-500"
                }
              >
                {item.icon}
              </span>
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-white leading-none">
                  {item.badge}
                </span>
              )}
              {active && !(item.badge && item.badge > 0) && (
                <ChevronRight className="h-3 w-3 ml-auto text-[#C8956C]" />
              )}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <p className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider px-3 pt-4 pb-1">
              管理
            </p>
            <Link
              href="/admin/advisors"
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2.5 group ${
                isActive("/admin/advisors")
                  ? "bg-[#FBF0E3] text-[#8B5E3C] font-semibold"
                  : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
              }`}
            >
              <span className={isActive("/admin/advisors") ? "text-[#C8956C]" : "text-stone-400 group-hover:text-stone-500"}>
                <Users className="h-4 w-4" />
              </span>
              顧問管理
              {isActive("/admin/advisors") && (
                <ChevronRight className="h-3 w-3 ml-auto text-[#C8956C]" />
              )}
            </Link>
          </>
        )}
      </nav>

      <div className="p-3 border-t border-[#EDE0CE]">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-xl text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center gap-2 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          登出系統
        </button>
      </div>
    </aside>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "oklch(0.985 0.012 75)" }}
    >
      <SidebarNav />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
