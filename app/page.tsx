import { redirect } from "next/navigation";

// 顧問登入後的首頁＝待辦（原型 advhome）
export default function RootPage() {
  redirect("/todo");
}
