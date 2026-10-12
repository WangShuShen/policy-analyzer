"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/*
 * 客戶端頂部列（原型 renderNav）。
 * 漏斗階段（落地頁、同意書）只有進度列——這時給導覽只會讓人中途跑掉；進了產品換成常駐導覽。
 */
const CNAV: [string, string, string, boolean?][] = [["/consult", "諮詢", "chat"], ["/analysis", "我的分析", "analysis"], ["/me", "我的頁面", "me"], ["", "保險快訊", "news", true]];

export function ClientChrome({ name }: { name: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const funnel = path.startsWith("/welcome");
  const cur = path.startsWith("/analysis") ? "analysis" : path.startsWith("/me") || path.startsWith("/booked") ? "me" : "chat";
  const progress = path === "/welcome" ? 25 : path.startsWith("/welcome/consent") ? 60 : 0;
  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); router.push("/welcome"); };
  return (
    <div className="chrome">
      <Link className="brand" href={funnel || !name ? "/welcome" : "/me"} style={{ color: "inherit", textDecoration: "none" }}>RAD<i>IA</i></Link>
      {funnel || !name ? (
        <span className="prog"><span style={{ width: `${progress}%` }} /></span>
      ) : (
        <>
          <nav className="cnav">
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
