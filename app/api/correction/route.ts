import { NextRequest, NextResponse } from "next/server";
import { saveCorrection } from "@/lib/policyCache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, fieldPath, oldValue, newValue, note } = body;

    if (!productId || !fieldPath || !newValue) {
      return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
    }

    await saveCorrection({ productId, fieldPath, oldValue, newValue, note });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
