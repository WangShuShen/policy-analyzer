import { NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";
import type { JWTPayload } from "@/lib/jwt";
import { ACTION_LABELS, isInternal, limitFor, planOf, type Action, type PlanId } from "@/lib/plans";

/** 用量統計的期別鍵：YYYY-MM。換月即換鍵，額度自然重置。 */
export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function getUsage(userId: string, period = currentPeriod()): Promise<Record<string, number>> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT action, count FROM usage_counters WHERE user_id = ? AND period = ?",
    args: [userId, period],
  });
  const usage: Record<string, number> = {};
  for (const row of result.rows) {
    usage[row.action as string] = Number(row.count ?? 0);
  }
  return usage;
}

export interface QuotaDenied {
  ok: false;
  response: NextResponse;
}

export type QuotaResult = { ok: true; remaining: number | null } | QuotaDenied;

function denied(action: Action, plan: PlanId, limit: number, used: number): QuotaDenied {
  const label = ACTION_LABELS[action];
  const body =
    limit === 0
      ? {
          error: `「${label}」需要升級方案才能使用`,
          code: "plan_required" as const,
        }
      : {
          error: `本月「${label}」額度已用完（${used}/${limit}）`,
          code: "quota_exceeded" as const,
        };
  return {
    ok: false,
    // 402 Payment Required：前端據此導向升級提示頁
    response: NextResponse.json(
      { ...body, action, plan, limit, used, upgradeUrl: "/pricing" },
      { status: 402 }
    ),
  };
}

/**
 * 檢查並扣抵一次額度。內部顧問不受限。
 * 超出額度時回傳 402，前端可直接把使用者導向 /pricing。
 */
export async function consume(session: JWTPayload, action: Action): Promise<QuotaResult> {
  if (isInternal(session)) return { ok: true, remaining: null };

  const plan = planOf(session);
  const limit = limitFor(plan, action);
  if (limit === null) return { ok: true, remaining: null };

  const userId = session.advisorId;
  const period = currentPeriod();

  if (limit === 0) {
    const usage = await getUsage(userId, period);
    return denied(action, plan, 0, usage[action] ?? 0);
  }

  await ensureInit();
  const result = await db.execute({
    sql: `INSERT INTO usage_counters (user_id, period, action, count)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(user_id, period, action)
          DO UPDATE SET count = count + 1, updated_at = datetime('now')
          RETURNING count`,
    args: [userId, period, action],
  });

  const used = Number(result.rows[0]?.count ?? 1);
  if (used > limit) {
    // 超出額度：把剛才多加的一次退回，避免計數無止境累積。
    await db.execute({
      sql: `UPDATE usage_counters SET count = count - 1
            WHERE user_id = ? AND period = ? AND action = ?`,
      args: [userId, period, action],
    });
    return denied(action, plan, limit, limit);
  }

  return { ok: true, remaining: limit - used };
}

/**
 * 退還一次額度。用於「已扣抵但功能實際失敗」的情況——
 * 免費版每月只有 1 次分析，失敗還扣額度會讓使用者直接流失。
 */
export async function refund(session: JWTPayload, action: Action): Promise<void> {
  if (isInternal(session)) return;
  if (limitFor(planOf(session), action) === null) return;

  await ensureInit();
  await db.execute({
    sql: `UPDATE usage_counters SET count = count - 1, updated_at = datetime('now')
          WHERE user_id = ? AND period = ? AND action = ? AND count > 0`,
    args: [session.advisorId, currentPeriod(), action],
  });
}

/** 只檢查功能是否開放、不扣抵（例如頁面初次載入時判斷要不要顯示鎖頭）。 */
export function featureAllowed(session: JWTPayload, action: Action): boolean {
  if (isInternal(session)) return true;
  return limitFor(planOf(session), action) !== 0;
}
