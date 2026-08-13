import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  createSignedCoachingPhotoUrl,
  getCoachingDailyLogDetail,
  resolveCoachingPortalContext,
  resolveActiveCoachingPortal,
  serializeCoachingDailyLogDetail,
} from "@/lib/coaching/coaching-service";
import { listCoachingRecentDaySummaries } from "@/lib/coaching/list-coaching-recent-day-summaries";
import { listCustomerSafeDirectiveReminders } from "@/lib/coaching/list-customer-safe-directive-reminders";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { mapBodyRecordRow } from "@/lib/coaching/ai/load-coaching-generation-context";
import { loadImmediateDailyFeedbackForPortal } from "@/lib/coaching/load-immediate-daily-feedback";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";
import { resolveEnrollmentPlannedEndDate } from "@/lib/coaching/enrollment-window";

export const runtime = "nodejs";

async function loadPortalProgress(input: {
  enrollmentId: string;
  customerId: string;
  goal: string | null | undefined;
  startedAt: string | null | undefined;
  logDate: string;
}) {
  const supabase = createSupabaseServiceClient();
  // TODO: planned_end_at is soft until portal RPC always returns plannedEndAt on context.
  const enrollmentQuery = await supabase
    .from("coaching_enrollments")
    .select("goal, started_at, baseline_body_record_id, planned_end_at")
    .eq("id", input.enrollmentId)
    .maybeSingle();

  const enrollment =
    enrollmentQuery.error && enrollmentQuery.error.message.includes("planned_end_at")
      ? (
          await supabase
            .from("coaching_enrollments")
            .select("goal, started_at, baseline_body_record_id")
            .eq("id", input.enrollmentId)
            .maybeSingle()
        ).data
      : enrollmentQuery.data;

  const { data: bodyRows } = await supabase
    .from("body_composition_records")
    .select("*")
    .eq("customer_id", input.customerId)
    .order("record_date", { ascending: false });

  const startedAt = enrollment?.started_at ?? input.startedAt ?? `${input.logDate}T00:00:00.000Z`;
  const plannedEndRaw =
    enrollment && "planned_end_at" in enrollment ? (enrollment as { planned_end_at?: string | null }).planned_end_at : null;
  const plannedEndAt =
    plannedEndRaw != null
      ? String(plannedEndRaw).slice(0, 10)
      : resolveEnrollmentPlannedEndDate({ startedAt, plannedEndAt: null });

  const progress = buildCoachingProgressView({
    enrollment: {
      goal: enrollment?.goal ?? input.goal ?? null,
      startedAt,
      baselineBodyRecordId: enrollment?.baseline_body_record_id ?? null,
    },
    bodyRecords: (bodyRows ?? []).map((row) => mapBodyRecordRow(row as Record<string, unknown>)),
    logDate: input.logDate,
  });

  return { progress, plannedEndAt };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { token } = await context.params;
    const url = new URL(request.url);
    const requestedLogDate = url.searchParams.get("logDate") ?? coachingTodayLogDate();
    const logDate = requireAllowedCoachingLogDate(requestedLogDate);

    const contextPayload = await resolveCoachingPortalContext(token);
    if (!contextPayload?.validToken) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    if (!contextPayload.hasActiveEnrollment || !contextPayload.enrollmentId || !contextPayload.customerId) {
      return NextResponse.json({
        ok: true,
        context: contextPayload,
        dailyLog: null,
        logDate,
        recentDays: [],
        progress: null,
        customerReminders: [],
      });
    }

    const portal = await resolveActiveCoachingPortal(token);
    const [recentDays, progressBundle, customerReminders] = await Promise.all([
      listCoachingRecentDaySummaries({
        enrollmentId: portal.enrollmentId,
        enrollmentStartedAt: contextPayload.startedAt ?? null,
        limit: 3,
      }),
      loadPortalProgress({
        enrollmentId: contextPayload.enrollmentId,
        customerId: contextPayload.customerId,
        goal: contextPayload.goal,
        startedAt: contextPayload.startedAt,
        logDate,
      }),
      listCustomerSafeDirectiveReminders({
        enrollmentId: portal.enrollmentId,
        logDate,
      }),
    ]);

    const { progress, plannedEndAt } = progressBundle;
    const enrichedContext = {
      ...contextPayload,
      // Soft fallback until RPC returns plannedEndAt.
      plannedEndAt: contextPayload.plannedEndAt ?? plannedEndAt,
    };

    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId: portal.enrollmentId,
      logDate,
    });

    if (!dailyLog.id) {
      return NextResponse.json({
        ok: true,
        context: enrichedContext,
        logDate,
        recentDays,
        progress,
        customerReminders,
        immediateFeedback: null,
        dailyLog: null,
      });
    }

    const immediateFeedback = dailyLog.submittedAt
      ? await loadImmediateDailyFeedbackForPortal({
          enrollmentId: portal.enrollmentId,
          ownerMemberId: portal.ownerMemberId,
          logDate,
          dailyLog,
        })
      : null;

    const serialized = serializeCoachingDailyLogDetail(dailyLog);
    const meals = await Promise.all(
      serialized.meals.map(async (meal) => {
        if (!meal.photo?.storagePath) {
          return meal;
        }
        const signedUrl = await createSignedCoachingPhotoUrl(meal.photo.storagePath);
        return {
          ...meal,
          photo: {
            ...meal.photo,
            signedUrl,
          },
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      context: enrichedContext,
      logDate,
      recentDays,
      progress,
      customerReminders,
      immediateFeedback,
      dailyLog: {
        ...serialized,
        meals,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load coaching portal.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
