import { getCoachingDailyLogDetail } from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  buildGo21DailyState,
  compactGo21DailyStateForAi,
  type Go21DailyStateInput,
} from "@/lib/go21/daily-state";
import {
  loadGo21DailyTargetsRecord,
  parseGo21DailyTargetsRecord,
  toGo21DailyTargetsPublicView,
} from "@/lib/go21/daily-targets";
import type { Go21DailyStatePublicView, Go21DailyTargetsPublicView } from "@/types/go21";

/**
 * Load today's Go21 daily state (targets + approx water/cal/protein/sleep).
 * Tolerates missing daily log / targets column.
 */
export async function loadGo21TodayDailyState(input: {
  enrollmentId: string;
  logDate?: string;
  targetsJson?: unknown;
}): Promise<{
  targets: Go21DailyTargetsPublicView | null;
  dailyState: Go21DailyStatePublicView;
  forAi: ReturnType<typeof compactGo21DailyStateForAi>;
}> {
  const logDate = input.logDate ?? coachingTodayLogDate();
  let targets: Go21DailyTargetsPublicView | null = null;
  if (input.targetsJson && typeof input.targetsJson === "object") {
    const asView = input.targetsJson as Go21DailyTargetsPublicView;
    if (asView.hasAny && ("waterMl" in asView || "caloriesKcal" in asView)) {
      targets = asView;
    } else {
      targets = toGo21DailyTargetsPublicView(parseGo21DailyTargetsRecord(input.targetsJson));
    }
  }
  if (!targets) {
    try {
      targets = toGo21DailyTargetsPublicView(await loadGo21DailyTargetsRecord(input.enrollmentId));
    } catch {
      targets = null;
    }
  }

  let detail: Awaited<ReturnType<typeof getCoachingDailyLogDetail>> | null = null;
  try {
    detail = await getCoachingDailyLogDetail({
      enrollmentId: input.enrollmentId,
      logDate,
    });
  } catch {
    detail = null;
  }

  const meals: Go21DailyStateInput["meals"] = [];
  if (detail) {
    for (const meal of detail.meals ?? []) {
      meals.push({
        slot: meal.mealSlot,
        note: meal.textNote,
        hasPhoto: Boolean(meal.photo?.storagePath),
        visionSummary: null,
        signals: [],
      });
    }
  }

  const hydrationQuality =
    detail?.customerNote && /喝水偏少|水喝很少/.test(detail.customerNote)
      ? ("low" as const)
      : detail?.customerNote && /喝水偏多|水喝很多/.test(detail.customerNote)
        ? ("high" as const)
        : null;

  const sleepNote =
    detail?.customerNote && /睡眠/.test(detail.customerNote)
      ? detail.customerNote.split("；").find((p) => /睡眠/.test(p)) ?? null
      : null;

  const dailyState = buildGo21DailyState({
    logDate,
    targets,
    waterMl: detail?.waterMl ?? null,
    hydrationQuality,
    sleepBedtime: detail?.sleepBedtime ?? null,
    sleepWakeTime: detail?.sleepWakeTime ?? null,
    sleepDurationLabel: detail?.sleepDuration ?? null,
    sleepNote,
    meals,
  });

  return {
    targets,
    dailyState,
    forAi: compactGo21DailyStateForAi(dailyState),
  };
}
