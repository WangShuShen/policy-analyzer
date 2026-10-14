import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth";
import { z } from "zod";
import { listClients } from "@/lib/advisor/clients";
import { createManualClient, CrmError } from "@/lib/crm/store";
import { buildTodos } from "@/lib/crm/todo";

// GET /api/advisor/clients → 我的客戶（側欄的待辦數也用這支）
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const rows = await listClients(a.advisorId);
  // 導覽列的待辦數＝首頁「需要現在處理」的件數（延後、關掉的不算，w2-03）
  const todo = (await buildTodos(a.advisorId)).items.filter(x => x.group === "now").length;
  return NextResponse.json({ clients: rows, todo });
}

// POST /api/advisor/clients → 手動新增客戶（w2-01、4-f）。一定要勾「已取得客戶同意」（4-aq）
const NewClient = z.object({ name: z.string().max(100), phone: z.string().max(40).nullish(), note: z.string().max(1000).nullish(), consent: z.literal(true) });

export async function POST(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const p = NewClient.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues.some(i => i.path[0] === "consent") ? "要先取得客戶同意，並勾選確認，才能建立" : "資料格式不對" }, { status: 400 });
  try {
    return NextResponse.json({ userId: await createManualClient(a.advisorId, p.data) });
  } catch (e) {
    if (e instanceof CrmError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
