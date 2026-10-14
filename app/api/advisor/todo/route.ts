import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { CrmError, dismissTodo, restoreTodo, snoozeTodo, snoozeUntil } from "@/lib/crm/store";
import { buildTodos } from "@/lib/crm/todo";

// 首頁待辦（w2-03）。GET → 待辦＋已處理；POST { key, action: "snooze", option } | { key, action: "dismiss", reason } | { key, action: "restore" }
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  return NextResponse.json(await buildTodos(a.advisorId));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snooze"), key: z.string().max(200), option: z.string().max(20) }),
  z.object({ action: z.literal("dismiss"), key: z.string().max(200), reason: z.string().max(40) }),
  z.object({ action: z.literal("restore"), key: z.string().max(200) }),
]);

export async function POST(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "資料格式不對" }, { status: 400 });
  const b = p.data;
  try {
    if (b.action === "snooze") await snoozeTodo(a.advisorId, b.key, snoozeUntil(b.option));
    else if (b.action === "dismiss") await dismissTodo(a.advisorId, b.key, b.reason);
    else await restoreTodo(a.advisorId, b.key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CrmError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
