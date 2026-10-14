"use client";

import { useEffect } from "react";

/*
 * 開啟追蹤（W2 w2-04，通用）：客戶打開哪一頁、看到哪幾段、各停多久，給顧問「客戶看過 N 次、在哪段停最久」與回訪提示。
 * 現在掛在「我的分析」；W4 規劃書頁放同一個元件（page="plan"）就能用。
 * 段落＝容器裡符合 selector 的區塊，標題取 labelSelector 的文字；畫面上露出一半以上、而且分頁在前景才算時間。
 * 只記時間與段落名稱，不記任何內容或輸入。
 */
export function ViewTracker({ page, refId, selector, labelSelector }: { page: string; refId?: string | null; selector: string; labelSelector: string }) {
  useEffect(() => {
    let id: string | null = null, closed = false;
    const t0 = Date.now(); let fgMs = 0, fgSince: number | null = document.visibilityState === "visible" ? t0 : null;
    const secMs = new Map<string, number>(), seenSince = new Map<string, number>(), labelOf = new Map<Element, string>();
    const els = [...document.querySelectorAll(selector)].slice(0, 30);
    els.forEach((el, i) => labelOf.set(el, (el.querySelector(labelSelector)?.textContent ?? `第 ${i + 1} 段`).trim().slice(0, 30)));
    const now = () => Date.now();
    const stopSec = (k: string) => { const s = seenSince.get(k); if (s != null) { secMs.set(k, (secMs.get(k) ?? 0) + now() - s); seenSince.delete(k); } };
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        const k = labelOf.get(e.target)!;
        if (e.isIntersecting && document.visibilityState === "visible") { if (!seenSince.has(k)) seenSince.set(k, now()); } else stopSec(k);
      }
    }, { threshold: 0.5 });
    els.forEach(el => io.observe(el));
    const snapshot = () => {
      const t = now();
      const ms = fgMs + (fgSince != null ? t - fgSince : 0);
      const sections = [...new Set([...secMs.keys(), ...seenSince.keys()])].map(k => ({ key: k, ms: (secMs.get(k) ?? 0) + (seenSince.has(k) ? t - seenSince.get(k)! : 0) })).filter(s => s.ms >= 1000);
      return { action: "update", id, durationMs: Math.round(ms), sections };
    };
    const send = (beacon: boolean) => {
      if (!id) return;
      const body = JSON.stringify(snapshot());
      if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/view-events", new Blob([body], { type: "application/json" }));
      else fetch("/api/view-events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { fgSince = now(); }
      else { if (fgSince != null) { fgMs += now() - fgSince; fgSince = null; } [...seenSince.keys()].forEach(stopSec); send(true); }
    };
    document.addEventListener("visibilitychange", onVis);
    const onHide = () => send(true);
    window.addEventListener("pagehide", onHide);
    const timer = setInterval(() => send(false), 30_000);
    fetch("/api/view-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "open", page, refId: refId ?? null }) })
      .then(r => r.ok ? r.json() : null).then(j => { if (j?.id && !closed) id = j.id; }).catch(() => {});
    return () => { closed = true; send(false); clearInterval(timer); io.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, [page, refId, selector, labelSelector]);
  return null;
}
