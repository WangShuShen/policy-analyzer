"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/*
 * 客戶端頂部列（原型 renderNav）。
 * 漏斗階段（落地頁、同意書）只有進度列——這時給導覽只會讓人中途跑掉；進了產品換成常駐導覽。
 * 保險快訊（W3）、保險小教室（4-av）是公開頁：沒登入的訪客看到這兩個分頁＋「登入」＋「免費聊聊」（顧問 10/14 核可設計稿）。
 */
const CNAV: [string, string, string, boolean?][] = [["/consult", "諮詢", "chat"], ["/analysis", "我的分析", "analysis"], ["/me", "我的頁面", "me"], ["/news", "保險快訊", "news"], ["/guide", "保險小教室", "guide"]];
const PUBLIC_TABS = new Set(["news", "guide"]);

export function ClientChrome({ name }: { name: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const funnel = path.startsWith("/welcome");
  const news = path === "/news" || path.startsWith("/news/");
  const guide = path === "/guide" || path.startsWith("/guide/");
  const cur = news ? "news" : guide ? "guide" : path.startsWith("/analysis") ? "analysis" : path.startsWith("/me") || path.startsWith("/booked") ? "me" : "chat";
  // 手機上分頁會橫向捲：目前這頁的分頁捲進畫面（不然在小教室時看不到哪個亮著）
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { navRef.current?.querySelector<HTMLElement>(".cnb.on")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [cur]);
  const progress = path === "/welcome" ? 25 : path.startsWith("/welcome/consent") ? 60 : 0;
  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); router.push("/welcome"); };
  return (
    <div className="chrome">
      <Link className="brand" href={funnel || !name ? "/welcome" : "/me"} style={{ color: "inherit", textDecoration: "none" }}>RAD<i>IA</i></Link>
      {(news || guide) && !name ? (
        <>
          <nav className="cnav" ref={navRef}>
            {CNAV.filter(([, , k]) => PUBLIC_TABS.has(k)).map(([href, t, k]) =>
              <Link key={k} href={href} className={`cnb ${cur === k ? "on" : ""}`} style={{ textDecoration: "none" }}>{t}</Link>)}
          </nav>
          <Link href="/me" className="cnb" style={{ textDecoration: "none" }}>登入</Link>
          <Link href="/welcome" className="cnb rd-cta" style={{ textDecoration: "none" }}>免費聊聊</Link>
        </>
      ) : funnel || !name ? (
        <span className="prog"><span style={{ width: `${progress}%` }} /></span>
      ) : (
        <>
          <nav className="cnav" ref={navRef}>
            {CNAV.map(([href, t, k, soon]) => soon
              ? <button key={k} className="cnb" disabled>{t}<span className="soon">W3</span></button>
              : <Link key={k} href={href} className={`cnb ${cur === k ? "on" : ""}`} style={{ textDecoration: "none" }}>{t}</Link>)}
          </nav>
          <div style={{ position: "relative" }}>
            <button className="cacc" onClick={() => setMenu(!menu)} aria-expanded={menu}><span className="cav">{name.slice(0, 1)}</span><span>{name}</span></button>
            {menu && (
              <div className="rd-menu">
                <button onClick={logout}>登出</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
