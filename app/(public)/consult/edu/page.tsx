import { connection } from "next/server";
import { EduChat } from "@/components/public/EduChat";
import { aiMock } from "@/lib/consult/mock";
import { MockBanner } from "@/components/public/MockBanner";

// 衛教模式：沒有同意個資蒐集時走這條（4-z「拒絕的那條路也要做完整」、N22）
export default async function EduPage() {
  await connection();       // 模擬模式要在執行時判斷，不能在打包時就定死
  return <>{aiMock() && <MockBanner />}<EduChat /></>;
}
