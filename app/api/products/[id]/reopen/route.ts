import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";
import db, { ensureInit } from "@/lib/db";
import crypto from "crypto";

type Params = { params: Promise<{ id: string }> };

// POST /api/products/[id]/reopen — 把已歸檔商品送回審核佇列（id = planCode）
// 將 policy status 改回 uploaded、指派給目前顧問，回傳 uuid 供前端跳轉編輯頁
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const planCode = decodeURIComponent(id);
    await ensureInit();

    const r = await db.execute({
      sql: "SELECT uuid FROM policies WHERE plan_code = ? AND analysis_json IS NOT NULL ORDER BY archived_at DESC, updated_at DESC LIMIT 1",
      args: [planCode],
    });
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "找不到此商品的分析紀錄" }, { status: 404 });
    }
    const uuid = r.rows[0].uuid as string;

    await db.execute({
      sql: "UPDATE policies SET status = 'uploaded', archived_at = NULL, updated_at = datetime('now') WHERE uuid = ?",
      args: [uuid],
    });

    // 指派給目前顧問（沒登入就略過指派，仍可由 /review/[uuid] 直接編輯）
    const token = req.cookies.get("auth_token")?.value;
    const payload = token ? await verifyJWT(token) : null;
    if (payload) {
      const today = new Date().toISOString().slice(0, 10);
      const exists = await db.execute({
        sql: "SELECT id FROM policy_assignments WHERE policy_uuid = ? AND advisor_id = ? LIMIT 1",
        args: [uuid, payload.advisorId],
      });
      if (exists.rows.length === 0) {
        await db.execute({
          sql: "INSERT INTO policy_assignments (id, policy_uuid, advisor_id, assigned_date, status) VALUES (?,?,?,?,'pending')",
          args: [crypto.randomUUID(), uuid, payload.advisorId, today],
        });
      } else {
        await db.execute({
          sql: "UPDATE policy_assignments SET status = 'pending', completed_at = NULL WHERE policy_uuid = ? AND advisor_id = ?",
          args: [uuid, payload.advisorId],
        });
      }
    }

    return NextResponse.json({ success: true, uuid });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
