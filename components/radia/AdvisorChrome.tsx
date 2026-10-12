"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdvisorBell } from "./AdvisorBell";

// 顧問端頂部列：跟客戶端同一個 RADIA 外框（原型 advui 也在同一個 .viewport 裡），右上角是通知鈴鐺與帳號
export function AdvisorChrome({ name }: { name: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); router.push("/login"); };
  return (
    <div className="chrome">
      <Link className="brand" href="/todo" style={{ color: "inherit", textDecoration: "none" }}>RAD<i>IA</i></Link>
      <span style={{ flex: 1 }} />
      <AdvisorBell />
      <div style={{ position: "relative" }}>
        <button className="cacc" onClick={() => setMenu(!menu)} aria-expanded={menu}><span className="cav">{name.slice(0, 1)}</span><span>{name}</span></button>
        {menu && <div className="rd-menu"><button onClick={logout}>登出</button></div>}
      </div>
    </div>
  );
}
