import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth";
import { roleOf } from "@/lib/jwt";
import { DataRequestError, listMine, submitRequest } from "@/lib/mydata/store";

// 我的資料（4-ap、N5）：客戶送出查詢／更正／刪除申請、看自己的申請進度。
// 不要求「已同意目前版本」——撤回同意、要求刪除的人也要能送出（個資法第 3 條權利不得限制）
async function customer(req: NextRequest) {
  const s = await requireIdentity(req);
  if (s instanceof NextResponse) return s;
  if (roleOf(s) !== "customer") return NextResponse.json({ error: "這裡是客戶的個資申請" }, { status: 403 });
  return s.advisorId;
}

export async function GET(req: NextRequest) {
  const uid = await customer(req);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json({ requests: await listMine(uid) });
}

const Body = z.object({ kind: z.enum(["access", "correct", "delete"]), message: z.string().max(2000) });

export async function POST(req: NextRequest) {
  const uid = await customer(req);
  if (uid instanceof NextResponse) return uid;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "請選一種申請並寫一句說明" }, { status: 400 });
  try {
    return NextResponse.json(await submitRequest(uid, p.data.kind, p.data.message));
  } catch (e) {
    if (e instanceof DataRequestError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
