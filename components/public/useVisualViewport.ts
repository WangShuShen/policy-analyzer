"use client";

import { useEffect, type RefObject } from "react";

/*
 * 諮詢頁一屏版面用（ConsultChat、EduChat）：手機鍵盤彈出時 iOS 的 100dvh 不會扣掉鍵盤，
 * 改用 visualViewport 的高度（CSS 變數 --vvh），底部輸入列才會貼在鍵盤上面。
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport, root = document.documentElement; if (!vv) return;
    const fit = () => { root.style.setProperty("--vvh", `${Math.round(vv.height)}px`); if (vv.offsetTop > 0) window.scrollTo(0, 0); };
    fit();
    vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); root.style.removeProperty("--vvh"); };
  }, []);
}

// 底部輸入列的高度（CSS 變數 --ddock-h）給開發版回饋鈕用：放在輸入列上面，不擋「送出」。輸入列重新掛上時 deps 要變
export function useDockHeight(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = ref.current, root = document.documentElement; if (!el) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--ddock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--ddock-h"); };
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
}
