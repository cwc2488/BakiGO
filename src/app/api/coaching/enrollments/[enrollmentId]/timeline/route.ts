import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { loadCoachingTimelinePage } from "@/lib/coaching/timeline/load-coaching-timeline";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { CoachingTimelineFilter } from "@/types/coaching-timeline";

export const runtime = "nodejs";

const FILTERS = new Set<CoachingTimelineFilter>([
  "all",
  "daily_report",
  "body_measurement",
  "attention",
  "coach_action",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const url = new URL(request.url);
    const asOfLogDate = url.searchParams.get("asOfLogDate") ?? coachingTodayLogDate();
    const filterParam = (url.searchParams.get("filter") ?? "all") as CoachingTimelineFilter;
    const cursor = url.searchParams.get("cursor");
    const limitParam = url.searchParams.get("limit");
    const focusDates = (url.searchParams.get("focusDates") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
    const reasonCodes = (url.searchParams.get("reasonCodes") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!FILTERS.has(filterParam)) {
      return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
    }

    const { page } = await loadCoachingTimelinePage({
      enrollmentId,
      ownerMemberId: memberId,
      asOfLogDate,
      filter: filterParam,
      cursor,
      limit: limitParam ? Number(limitParam) : 14,
      focusDates,
      reasonCodes,
    });

    return NextResponse.json({ ok: true, ...page });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching timeline.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
