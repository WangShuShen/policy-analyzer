"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** 頁面的主要動作按鈕放進外框底部（原型 .foot：手機固定在底部、桌機接在內容下方） */
export function Foot({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById("rd-foot")); }, []);
  return el ? createPortal(children, el) : null;
}
