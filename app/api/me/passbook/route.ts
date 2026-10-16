import { NextRequest, NextResponse } from "next/server";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { deletePassbook, EraseError } from "@/lib/account/erase";

// 客戶自己刪保險存摺（4-aw）：馬上生效、不能復原（確認步驟在頁面上）。
// 跟我的資料一樣不要求「已同意目前版本」——撤回同意的人也要能刪
export async function DELETE(req: NextRequest) {
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return NextResponse.json({ error: "只有客戶本人可以刪除" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await deletePassbook(s.advisorId)) });
  } catch (e) {
    if (e instanceof EraseError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
