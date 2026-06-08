import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_DIR = process.env.DB_DIR ?? "";

export async function GET(req: NextRequest) {
  const planCode = req.nextUrl.searchParams.get("planCode");
  const driveId = req.nextUrl.searchParams.get("driveId");

  if (!planCode && !driveId) {
    return new NextResponse("Missing planCode or driveId", { status: 400 });
  }

  // Try local file first: {DB_DIR}/tmp/pdfs/{planCode}.pdf
  if (planCode && DB_DIR) {
    const localPath = path.join(DB_DIR, "tmp", "pdfs", `${planCode}.pdf`);
    if (fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(buffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Fallback: Google Drive direct download
  if (driveId) {
    const driveUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
    try {
      const res = await fetch(driveUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(buffer.length),
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } catch {
      // fall through to error
    }
  }

  return new NextResponse("PDF not found", { status: 404 });
}
