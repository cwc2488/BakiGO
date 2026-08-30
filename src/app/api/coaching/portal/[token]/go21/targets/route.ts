import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { requireGo21Portal } from "@/lib/go21/go21-portal";
import { loadGo21TodayDailyState } from "@/lib/go21/load-daily-state";

export const runtime = "nodejs";

/** Customer portal — read targets + today's soft daily state (coach owns edits). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const { portal } = await requireGo21Portal(token);
    const loaded = await loadGo21TodayDailyState({ enrollmentId: portal.enrollmentId });
    return NextResponse.json({
      ok: true,
      targets: loaded.targets,
      dailyState: loaded.dailyState,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入每日目標");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
