import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdvisor } from "@/lib/auth";
import { advisorCanSee, audit, computeGapsForUser, overrideGap } from "@/lib/consult/gaps";

/*
 * 顧問核對缺口分級（實作設計 G1）。
 * 只能看、只能改自己有預約的客戶；每次查看與改級都寫稽核紀錄（N12）。
 */
type Params = { params: Promise<{ userId: string }> };

const KEYS = ["life", "survival", "reimb", "daily", "accident", "cancer", "card", "critical", "ltc", "disability"] as const;
const LEVELS = ["must", "boost", "ok", "later"] as const;

async function guard(req: NextRequest, userId: string) {
  const a = await requireAdvisor(req);
  if (a instanceof NextResponse) return a;
  if (!(await advisorCanSee(a.advisorId, userId))) return NextResponse.json({ error: "這位客戶沒有預約你" }, { status: 403 });
  return a;
}

// GET → 系統原判、顧問改過的、目前生效的分級
export async function GET(req: NextRequest, { params }: Params) {
  const { userId } = await params;
  const a = await guard(req, userId);
  if (a instanceof NextResponse) return a;
  const rows = await computeGapsForUser(userId);
  await audit(a.advisorId, "view_gaps", userId, "gap");
  if (!rows) return NextResponse.json({ rows: null, note: "客戶還沒有可用的保單資料（存摺未上傳或還沒對到任何一張）" });
  return NextResponse.json({ rows });
}

// PUT → 改級（理由必填）；改回系統原判等於撤銷
export async function PUT(req: NextRequest, { params }: Params) {
  const { userId } = await params;
  const a = await guard(req, userId);
  if (a instanceof NextResponse) return a;
  const body = z.object({ key: z.enum(KEYS), level: z.enum(LEVELS), reason: z.string().trim().min(2, "請寫一句理由").max(300) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "格式不正確" }, { status: 400 });
  const rows = await computeGapsForUser(userId);
  const row = rows?.find(r => r.key === body.data.key);
  if (!row) return NextResponse.json({ error: "客戶還沒有可用的保單資料，無法分級" }, { status: 409 });
  await overrideGap(a.advisorId, userId, body.data.key, body.data.level, body.data.reason, row.systemLevel);
  return NextResponse.json({ rows: await computeGapsForUser(userId) });
}
