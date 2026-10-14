import { NextResponse } from "next/server";
import { PlanError } from "./store";

/** PlanError → HTTP 回應；其他錯誤往上丟 */
export function planErrorResponse(e: unknown): NextResponse {
  if (!(e instanceof PlanError)) throw e;
  const status = e.code === "not_found" ? 404 : e.code === "not_my_client" ? 403 : 400;
  return NextResponse.json({ error: e.message, details: e.details }, { status });
}
