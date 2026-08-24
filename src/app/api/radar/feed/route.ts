import { NextResponse } from "next/server";
import { loadRadarPartnerFeed } from "@/lib/radar/partner/load-radar-partner-feed";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  }

  try {
    const feed = await loadRadarPartnerFeed({
      repo: new SupabaseRadarRepository(createSupabaseServiceClient()),
      member_id,
    });
    return NextResponse.json({ ok: true, feed });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load radar" },
      { status: 500 },
    );
  }
}
