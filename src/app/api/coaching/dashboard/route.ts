import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getCoachingDashboardRows,
} from "@/lib/coaching/coaching-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const logDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();
    const rows = await getCoachingDashboardRows(memberId, logDate);
    return NextResponse.json({ ok: true, logDate, rows });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching dashboard.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
