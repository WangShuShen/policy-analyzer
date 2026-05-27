import { NextResponse } from "next/server";
import { recentAnalyses } from "@/lib/policyCache";

export async function GET() {
  try {
    const rows = await recentAnalyses(30);
    return NextResponse.json({ analyses: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
