import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ACTION_LABEL, auditAdminView, listAudit } from "@/lib/admin/audit";

// GET /api/admin/audit?actor=&user=&action=&from=YYYY-MM-DD&to=YYYY-MM-DD → 查閱紀錄（w1b-07、N12），只有管理者
const Q = z.object({
  actor: z.string().max(100).optional(),
  user: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(req: NextRequest) {
  const who = await requireAdmin(req);
  if (who instanceof NextResponse) return who;
  const q = Q.safeParse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== "")));
  if (!q.success) return NextResponse.json({ error: "篩選條件格式不正確" }, { status: 400 });
  // 日期以台灣時間解讀，換成資料庫的 UTC 文字格式；「到」那天整天都算進去
  const utc = (d: string, addDays = 0) => new Date(Date.parse(`${d}T00:00:00+08:00`) + addDays * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const f = { actorId: q.data.actor, userId: q.data.user, action: q.data.action,
    from: q.data.from && utc(q.data.from), to: q.data.to && utc(q.data.to, 1), limit: q.data.limit };
  const rows = await listAudit(f);
  await auditAdminView(who.advisorId, f);
  return NextResponse.json({ rows, actions: ACTION_LABEL });
}
