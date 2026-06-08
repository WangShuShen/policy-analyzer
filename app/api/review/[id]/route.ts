import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const DB_DIR = process.env.DB_DIR ?? "";

// GET /api/review/[id] → load analyzed JSON for this planCode
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analysisPath = path.join(DB_DIR, "analyzed", `${id}.json`);
    if (!fs.existsSync(analysisPath)) {
      return NextResponse.json({ error: "分析檔案不存在" }, { status: 404 });
    }
    const data = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT /api/review/[id] → save edits: update analyzed JSON + sync back to Google Sheet
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, sheetUrl } = await req.json();

    const analysisPath = path.join(DB_DIR, "analyzed", `${id}.json`);
    if (!fs.existsSync(analysisPath)) {
      return NextResponse.json({ error: "分析檔案不存在" }, { status: 404 });
    }

    // 合併更新（保留 _rawResponse 等欄位）
    const existing = JSON.parse(fs.readFileSync(analysisPath, "utf-8"));
    const updated = { ...existing, ...data };
    fs.writeFileSync(analysisPath, JSON.stringify(updated, null, 2), "utf-8");

    // 同步回 Google Sheet
    if (sheetUrl) {
      const scriptPath = path.join(DB_DIR, "push_to_sheets.py");
      const tmpPath = path.join(DB_DIR, `tmp_update_${id}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      try {
        const { stdout } = await execAsync(
          `python3 "${scriptPath}" --update-data "${sheetUrl}" "${tmpPath}"`,
          { cwd: DB_DIR, timeout: 30000 }
        );
        return NextResponse.json({ success: true, output: stdout });
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      error: error.message ?? String(err),
      stderr: error.stderr,
    }, { status: 500 });
  }
}

// PATCH /api/review/[id] → archive: run push_to_sheets.py --archive {sheetUrl} --force
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sheetUrl, pdfDriveId } = await req.json();

    if (!sheetUrl) {
      return NextResponse.json({ error: "缺少 sheetUrl" }, { status: 400 });
    }

    const scriptPath = path.join(DB_DIR, "push_to_sheets.py");
    let cmd = `python3 "${scriptPath}" --archive "${sheetUrl}" --force`;
    if (pdfDriveId) cmd += ` --pdf-id "${pdfDriveId}"`;

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: DB_DIR,
      timeout: 60000,
    });

    // Update uuid_registry.json: status → archived
    const registryPath = path.join(DB_DIR, "uuid_registry.json");
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      if (registry[id]) {
        registry[id].status = "archived";
        registry[id].archivedAt = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
      }
    }

    return NextResponse.json({
      success: true,
      output: stdout,
      warnings: stderr || undefined,
    });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      error: error.message ?? String(err),
      output: error.stdout,
      stderr: error.stderr,
    }, { status: 500 });
  }
}
