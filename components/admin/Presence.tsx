"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
 * 在線心跳（w1b-04）：分頁在前景時每 60 秒送一次，換頁也送一次。
 * 沒登入的頁面（落地頁、同意書、登入頁）會被 proxy 轉走 → 第一次沒成功就停，不會一直打。
 */
const EVERY_MS = 60_000;
let stopped = false;

export function Presence() {
  const path = usePathname();
  useEffect(() => {
    if (stopped) return;
    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), redirect: "manual", keepalive: true })
        .then(r => { if (r.status !== 204) stopped = true; })
        .catch(() => {});
    };
    beat();
    const t = setInterval(beat, EVERY_MS);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [path]);
  return null;
}
