import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit } from "@/lib/db";
import { verifyCheckMacValue } from "@/lib/ecpay";
import { isPlanId } from "@/lib/plans";

// 綠界以 x-www-form-urlencoded POST 到這裡，成功時必須回覆純文字 "1|OK"，
// 否則綠界會持續重送。因此本端點必須冪等。
//
// 注意：每次都要「新建」Response。Response 的 body 只能被讀取一次，
// 共用同一個物件會讓第二次之後的回應變成空的，綠界會判定失敗並不斷重送。
function ok(): Response {
  return new Response("1|OK", { headers: { "content-type": "text/plain" } });
}

function addMonth(from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const payload: Record<string, string> = {};
  for (const [k, v] of form.entries()) payload[k] = String(v);

  // 一律驗簽：不可信任回傳內容。
  if (!verifyCheckMacValue(payload)) {
    console.error("[ecpay] CheckMacValue 驗證失敗", payload.MerchantTradeNo);
    return new Response("0|CheckMacValue Error", {
      status: 400,
      headers: { "content-type": "text/plain" },
    });
  }

  const merchantTradeNo = payload.MerchantTradeNo ?? "";
  const tradeNo = payload.TradeNo ?? "";
  const rtnCode = Number(payload.RtnCode ?? 0);
  const amount = Number(payload.TradeAmt ?? payload.PeriodAmount ?? 0);

  await ensureInit();

  const sub = await db.execute({
    sql: "SELECT id, user_id, plan, status FROM subscriptions WHERE merchant_trade_no = ?",
    args: [merchantTradeNo],
  });
  const row = sub.rows[0];
  if (!row) {
    // 查無訂單仍回 OK，避免綠界無止境重送；但記錄下來以便追查。
    console.error("[ecpay] 查無對應訂單", merchantTradeNo);
    return ok();
  }

  const userId = row.user_id as string;
  const plan = row.plan as string;

  // 冪等：同一筆 (MerchantTradeNo, TradeNo) 只會成功寫入一次。
  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO payments
            (merchant_trade_no, trade_no, user_id, plan, amount, rtn_code, rtn_msg, raw)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      merchantTradeNo,
      tradeNo,
      userId,
      plan,
      amount,
      rtnCode,
      payload.RtnMsg ?? "",
      JSON.stringify(payload),
    ],
  });

  if (inserted.rowsAffected === 0) {
    // 重送，先前已處理過。
    return ok();
  }

  const success = rtnCode === 1;

  if (success && isPlanId(plan)) {
    await db.execute({
      sql: `UPDATE subscriptions
            SET status = 'active', gwsr = ?, current_period_end = ?, fail_count = 0,
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [payload.gwsr ?? null, addMonth(), row.id as string],
    });
    await db.execute({
      sql: "UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?",
      args: [plan, addMonth(), userId],
    });
  } else if (!success) {
    // 扣款失敗：累計次數。綠界規則為連續失敗 6 次自動終止，
    // 我方在第 3 次先降回免費版，但保留資料不刪。
    const failed = await db.execute({
      sql: `UPDATE subscriptions
            SET fail_count = fail_count + 1, status = 'failed', updated_at = datetime('now')
            WHERE id = ? RETURNING fail_count`,
      args: [row.id as string],
    });
    const failCount = Number(failed.rows[0]?.fail_count ?? 1);
    if (failCount >= 3) {
      await db.execute({
        sql: "UPDATE users SET plan = 'free' WHERE id = ?",
        args: [userId],
      });
    }
  }

  return ok();
}
