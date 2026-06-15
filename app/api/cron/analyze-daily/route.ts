import { NextRequest, NextResponse } from "next/server";
import db, { ensureInit, type PolicyRow } from "@/lib/db";
import { analyzePolicyPdf } from "@/lib/analyzeEngine";
import { downloadDriveFile, hasDriveCredentials } from "@/lib/googleDrive";

// 每次呼叫的小批次（由排程迴圈累積到每日目標，避免單次函式逾時）
const DEFAULT_LIMIT = 8;

function verifySecret(req: NextRequest) {
  return req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasDriveCredentials()) {
    return NextResponse.json({ error: "缺少 GOOGLE_SERVICE_ACCOUNT_JSON 環境變數" }, { status: 500 });
  }

  await ensureInit();

  const limit = Number(process.env.DAILY_ANALYZE_LIMIT) || DEFAULT_LIMIT;
  const today = new Date().toISOString().slice(0, 10);

  // 挑出待分析、且有 Drive file ID 的保單
  const rows = await db.execute({
    sql: `SELECT * FROM policies
          WHERE status = 'pending_analysis' AND pdf_drive_id IS NOT NULL AND pdf_drive_id != ''
          ORDER BY created_at ASC
          LIMIT ?`,
    args: [limit],
  });
  const pending = rows.rows.map(r => r as unknown as PolicyRow);

  if (pending.length === 0) {
    return NextResponse.json({ analyzed: 0, message: "no pending policies" });
  }

  let analyzed = 0, failed = 0;
  const errors: string[] = [];

  for (const p of pending) {
    try {
      const pdf = await downloadDriveFile(p.pdf_drive_id!);
      if (!pdf || pdf.subarray(0, 4).toString("latin1") !== "%PDF") throw new Error("PDF 下載失敗");

      const { data, category } = await analyzePolicyPdf(pdf.toString("base64"));
      const enriched = { ...data, _analyzedAt: today, _detectedCategory: category };

      await db.execute({
        sql: `UPDATE policies SET analysis_json = ?, status = 'uploaded', uploaded_at = ?, updated_at = datetime('now') WHERE uuid = ?`,
        args: [JSON.stringify(enriched), today, p.uuid],
      });
      analyzed++;
    } catch (err) {
      failed++;
      errors.push(`${p.plan_code}: ${String(err)}`);
      await db.execute({
        sql: `UPDATE policies SET status = 'failed', updated_at = datetime('now') WHERE uuid = ?`,
        args: [p.uuid],
      });
    }
  }

  return NextResponse.json({
    analyzed,
    failed,
    limit,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
