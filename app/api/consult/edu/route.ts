import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eduReply } from "@/lib/consult/ai";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { capReached } from "@/lib/admin/usage";
import { PAUSED_TEXT } from "@/lib/consult/paused";

/*
 * 衛教模式（4-z、N22）：不用登入、一個字都不記——不寫資料庫、不寫 log 內容。
 * ⚠️ 不用登入＝任何人都能打。W1a 先用每個連線每小時 20 題的簡單限流（只在單一伺服器實例內有效）；
 *    W1b 對陌生人開放前要換成更強的防護（驗證碼或接 I6 的總金額警報）。
 */
const LIMIT = 20, WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

const Body = z.object({
  text: z.string().min(1).max(500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(20).default([]),
});

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    return NextResponse.json({ error: "這一小時問得有點多了，休息一下再來；想深入聊可以直接約顧問。" }, { status: 429 });
  }
  hits.set(ip, [...recent, now]);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  // N7：有登入的客戶今天 AI 用到上限，衛教也先停（衛教本身不記用量；沒登入的只有上面的限流）
  const who = await requireIdentity(req);
  if (!(who instanceof NextResponse) && roleOf(who) === "customer" && await capReached(who.advisorId)) {
    return NextResponse.json({ error: PAUSED_TEXT, code: "paused" }, { status: 429 });
  }
  try {
    const r = await eduReply(parsed.data.history, parsed.data.text);
    return NextResponse.json({ html: r.html });
  } catch {
    return NextResponse.json({ error: "這一題沒送出去，請再試一次" }, { status: 500 });
  }
}
