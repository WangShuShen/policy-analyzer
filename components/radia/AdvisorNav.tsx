"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/*
 * 顧問端標頭（原型 anav）：左邊標題＋副標，右邊分頁（待辦／客戶／保單分析／商品查詢／我的顧問頁）。
 * 保單審核、審核進度、顧問管理只給管理者（2026-10-11 決定：一般顧問的分頁跟原型完全一樣）。
 */
const ANAV: [string, string][] = [["/todo", "待辦"], ["/clients", "客戶"], ["/analyze", "保單分析"], ["/catalog", "商品查詢"], ["/profile", "我的顧問頁"]];
const ADMIN: [string, string][] = [["/review", "保單審核"], ["/admin/progress", "審核進度"], ["/admin/advisors", "顧問管理"]];
const TITLE: [string, string, string][] = [
  ["/clients/", "", ""], ["/clients", "客戶", "從 AI 諮詢預約你的客戶"], ["/analyze", "保單分析", "上傳保單條款，AI 自動解析填入全險圖"],
  ["/catalog", "商品查詢", "搜尋已審核的商品"], ["/product/", "商品條款", "給付、試算與條款原文"], ["/profile", "我的顧問頁", "客戶選顧問時看到的就是這一頁"],
  ["/review", "保單審核", "逐一審核 AI 分析結果，確認後歸檔"], ["/admin/progress", "審核進度", "全員審核狀況總覽"], ["/admin/advisors", "顧問管理", "僅名單內的 Google 帳號才可登入"],
];

const greeting = () => { const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false })); return h < 11 ? "早安" : h < 18 ? "午安" : "晚安"; };
const today = () => { const [m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).split("-").slice(1).map(Number); return `${m} 月 ${d} 日`; };

export function AdvisorNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const path = usePathname();
  const [todo, setTodo] = useState<number | null>(null);
  useEffect(() => { fetch("/api/advisor/clients").then(r => r.ok ? r.json() : null).then(d => setTodo(d?.todo ?? 0)).catch(() => {}); }, [path]);
  const tabs = isAdmin ? [...ANAV, ...ADMIN] : ANAV;
  const cur = tabs.find(([h]) => path === h || path.startsWith(h + "/"))?.[0] ?? (path.startsWith("/product") ? "/catalog" : "");
  const home = path === "/todo";
  const t = TITLE.find(([p]) => p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/"));
  return (
    <div className="ahd">
      <div>
        <div className="ah1">{home ? `${greeting()}，${name}` : t?.[1] ?? ""}</div>
        <div className="ah2">{home ? <>{today()} · {todo ? <><b>{todo} 件</b>要現在處理</> : "今天沒有急件"}</> : t?.[2]}</div>
      </div>
      <div className="ahnav">
        {tabs.map(([h, l]) => <Link key={h} href={h} className={`anb ${cur === h ? "on" : ""}`} style={{ textDecoration: "none" }}>{l}{h === "/todo" && todo ? `（${todo}）` : ""}</Link>)}
      </div>
    </div>
  );
}
