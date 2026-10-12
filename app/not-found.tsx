import Link from "next/link";
import { Shell } from "@/components/radia/Shell";

// 找不到頁面：一樣套 RADIA 外框（設計準則：錯誤頁也要有頁尾）
export default function NotFound() {
  return (
    <Shell chrome={<div className="chrome"><span className="brand">RAD<i>IA</i></span></div>}>
      <div className="gate" style={{ marginTop: 40 }}>
        <div className="gt">找不到這一頁</div>
        <div className="gd">網址可能打錯了，或這一頁已經搬走。</div>
        <div style={{ marginTop: 14 }}><Link className="btn" href="/welcome">回首頁</Link></div>
      </div>
    </Shell>
  );
}
