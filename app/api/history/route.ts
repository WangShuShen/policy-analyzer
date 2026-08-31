import { NextRequest, NextResponse } from "next/server";
import { recentAnalyses } from "@/lib/policyCache";
import { requireIdentity } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireIdentity(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const rows = await recentAnalyses(30);
    return NextResponse.json({ analyses: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
