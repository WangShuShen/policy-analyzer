import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { heartbeat } from "@/lib/admin/logins";

// POST /api/presence { path } → 在線心跳（w1b-04）。只有登入後才會到這裡（proxy 先擋）
export async function POST(req: NextRequest) {
  const who = await requireIdentity(req);
  if (who instanceof NextResponse) return who;
  const body = z.object({ path: z.string().max(500).optional() }).safeParse(await req.json().catch(() => ({})));
  await heartbeat({ id: who.advisorId, role: roleOf(who), isAdmin: !!who.isAdmin, name: who.name }, body.success ? body.data.path ?? null : null);
  return new NextResponse(null, { status: 204 });
}
