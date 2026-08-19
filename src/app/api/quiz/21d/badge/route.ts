import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { countPartner21dWaiting } from "@/lib/analysis/handoff/experience-21d-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: true, count: 0 });
  }
  const count = await countPartner21dWaiting(memberId);
  return NextResponse.json({ ok: true, count });
}
