import { NextRequest, NextResponse } from "next/server";
import { verifyAnalysis } from "@/lib/verifier";
import { requireIdentity } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const formData = await req.formData();
    const rawFiles = formData.getAll("files") as File[];
    const analysisJson = formData.get("analysisJson") as string;

    if (rawFiles.length === 0 || !analysisJson) {
      return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
    }

    const analysis = JSON.parse(analysisJson) as Record<string, unknown>;
    const fileBuffers: { buffer: Buffer; file: File }[] = await Promise.all(
      rawFiles.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), file: f }))
    );

    const verification = await verifyAnalysis(fileBuffers, analysis);
    return NextResponse.json({ verification });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
