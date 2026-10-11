import { NextRequest, NextResponse } from "next/server";
import db, { nowText } from "@/lib/db";
import { policies } from "@/lib/schema";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
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

  const limit = Number(process.env.DAILY_ANALYZE_LIMIT) || DEFAULT_LIMIT;
  const today = new Date().toISOString().slice(0, 10);

  // 挑出待分析、且有 Drive file ID 的保單
  const pending = await db.select().from(policies)
    .where(and(eq(policies.status, "pending_analysis"), isNotNull(policies.pdf_drive_id), ne(policies.pdf_drive_id, "")))
    .orderBy(asc(policies.created_at))
    .limit(limit);

  if (pending.length === 0) {
    return NextResponse.json({ analyzed: 0, message: "no pending policies" });
  }

  let analyzed = 0, failed = 0;
  const errors: string[] = [];

  for (const p of pending) {
    try {
      const pdf = await downloadDriveFile(p.pdf_drive_id!);
      if (!pdf || pdf.subarray(0, 4).toString("latin1") !== "%PDF") throw new Error("PDF 下載失敗");

      // 費率 PDF（補計劃別來源，可選）
      let ratePdfB64: string | undefined;
      if (p.rate_drive_id) {
        const rate = await downloadDriveFile(p.rate_drive_id);
        if (rate && rate.subarray(0, 4).toString("latin1") === "%PDF") ratePdfB64 = rate.toString("base64");
      }

      const { data, category } = await analyzePolicyPdf(pdf.toString("base64"), undefined, ratePdfB64);
      const enriched = { ...data, _analyzedAt: today, _detectedCategory: category };

      await db.update(policies)
        .set({ analysis_json: JSON.stringify(enriched), status: "uploaded", uploaded_at: today, updated_at: nowText })
        .where(eq(policies.uuid, p.uuid));
      analyzed++;
    } catch (err) {
      failed++;
      errors.push(`${p.plan_code}: ${String(err)}`);
      await db.update(policies).set({ status: "failed", updated_at: nowText }).where(eq(policies.uuid, p.uuid));
    }
  }

  return NextResponse.json({
    analyzed,
    failed,
    limit,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
