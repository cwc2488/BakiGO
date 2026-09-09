import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { readVapidPublicKey, isVapidConfigured } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json({ error: "推播尚未設定", publicKey: null }, { status: 503 });
  }

  return NextResponse.json({ publicKey: readVapidPublicKey() });
}
