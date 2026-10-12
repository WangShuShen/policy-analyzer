import { redirect } from "next/navigation";

// 舊的「約好了」頁併進「我的頁面 → 預約與進度」（原型 SCREENS.me）。保留這個網址給舊連結用
export default function BookedPage() {
  redirect("/me?tab=book");
}
