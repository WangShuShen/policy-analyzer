import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { markBooking, MarkError } from "@/lib/advisor/clients";
import { view as passbookView } from "@/lib/passbook/service";

/*
 * 標記面談結果（B1、4-ah）：met＝已面談（客戶端解鎖）｜no_show＝客戶沒出現｜undo＝標錯了撤銷。
 * P4：標已面談時，若客戶的保單還有「AI 初步讀取」未核對的，提醒先核（不擋）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  const body = z.object({ action: z.enum(["met", "no_show", "undo"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "格式不正確" }, { status: 400 });
  try {
    const r = await markBooking(a.advisorId, id, body.data.action);
    let warning: string | null = null;
    if (body.data.action === "met") {
      const pb = await passbookView(r.userId);
      if (pb.counts.preliminary > 0) warning = `客戶有 ${pb.counts.preliminary} 張保單的給付是 AI 初步讀取、還沒核對——送規劃書前要先核過（P4）`;
    }
    return NextResponse.json({ status: r.status, warning });
  } catch (e) {
    if (e instanceof MarkError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
