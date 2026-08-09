import { NextResponse } from "next/server";
import { buildRadarTodayResponse } from "@/lib/radar/today/build-today-response";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const snapshot_date =
    url.searchParams.get("snapshot_date") ?? resolveDailyPipelineRunDate({});

  try {
    const repo = new SupabaseRadarRepository(createSupabaseServiceClient());
    const response = await buildRadarTodayResponse({
      repo,
      member_id,
      snapshot_date,
    });

    if (!response) {
      return NextResponse.json({ error: "No snapshot for date" }, { status: 404 });
    }

    return NextResponse.json(response);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to load radar today";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
