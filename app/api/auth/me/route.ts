import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return NextResponse.json({ authenticated: false });

  const payload = await verifyJWT(token);
  if (!payload) return NextResponse.json({ authenticated: false });

  return NextResponse.json({
    authenticated: true,
    advisorId: payload.advisorId,
    email: payload.email,
    name: payload.name,
    isAdmin: payload.isAdmin,
  });
}
