import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  listPartner21dInterests,
  summarizePartner21dInterests,
} from "@/lib/analysis/handoff/experience-21d-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const interests = await listPartner21dInterests(memberId);
    return NextResponse.json({
      ok: true,
      interests,
      summary: summarizePartner21dInterests(interests),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load." },
      { status: 500 },
    );
  }
}
