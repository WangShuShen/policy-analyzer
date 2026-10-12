import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth";
import { listClients } from "@/lib/advisor/clients";

// GET /api/advisor/clients → 我的客戶（側欄的待辦數也用這支）
export async function GET(req: NextRequest) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  const rows = await listClients(a.advisorId);
  return NextResponse.json({ clients: rows, todo: rows.filter(r => r.group === "todo").length });
}
