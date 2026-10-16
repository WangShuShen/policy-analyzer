import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { deleteAccount, EraseError } from "@/lib/account/erase";
import { clearAuthCookie } from "@/lib/account/session";

// 客戶自己刪帳號（4-aw）：馬上生效、不能復原。頁面上要打「刪除」兩個字確認，這裡再檢查一次
const Body = z.object({ confirm: z.literal("刪除") });

export async function DELETE(req: NextRequest) {
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return NextResponse.json({ error: "只有客戶本人可以刪除帳號" }, { status: 403 });
  if (!Body.safeParse(await req.json().catch(() => null)).success) return NextResponse.json({ error: "請輸入「刪除」兩個字確認" }, { status: 400 });
  try {
    const r = await deleteAccount(s.advisorId);
    return clearAuthCookie(NextResponse.json({ ok: true, ...r }));
  } catch (e) {
    if (e instanceof EraseError) return clearAuthCookie(NextResponse.json({ error: e.message }, { status: 404 }));
    throw e;
  }
}
