import { addCalendarDays, resolveEnrollmentStartDate } from "@/lib/coaching/enrollment-window";
import { experience21dFromPlanSnapshot, EXPERIENCE_21D_DAYS } from "@/lib/coaching/experience-21d";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import {
  COACHING_AI_V2_CYCLE_DAYS,
  type CoachingAiV2Cycle,
  type CoachingAiV2LifecycleSnapshot,
  type CoachingAiV2LifecycleStage,
} from "@/types/coaching-ai-v2";

export function resolveAiV2CycleWindow(input: {
  enrollmentStartedAt: string | null | undefined;
  plannedEndAt?: string | null;
  planSnapshot?: CoachingPlanSnapshot | null;
}): { startDate: string; plannedEndDate: string } | null {
  const experience = experience21dFromPlanSnapshot(input.planSnapshot);
  if (experience) {
    const startDate = addCalendarDays(experience.productReceivedDate, 1);
    return {
      startDate,
      plannedEndDate: addCalendarDays(startDate, EXPERIENCE_21D_DAYS - 1),
    };
  }
  const start = resolveEnrollmentStartDate(input.enrollmentStartedAt);
  if (!start) return null;
  const endFromEnrollment = input.plannedEndAt?.slice(0, 10);
  if (endFromEnrollment && /^\d{4}-\d{2}-\d{2}$/.test(endFromEnrollment)) {
    // Cap intensive AI window at 21 days even if enrollment journey is longer.
    const capped = addCalendarDays(start, COACHING_AI_V2_CYCLE_DAYS - 1);
    return {
      startDate: start,
      plannedEndDate: endFromEnrollment < capped ? endFromEnrollment : capped,
    };
  }
  return {
    startDate: start,
    plannedEndDate: addCalendarDays(start, COACHING_AI_V2_CYCLE_DAYS - 1),
  };
}

/** Day 1 = cycle start date. Outside window → null. */
export function coachingAiV2DayNumber(input: {
  cycleStartDate: string;
  cycleEndDate: string;
  logDate: string;
}): number | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.cycleStartDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.cycleEndDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.logDate)
  ) {
    return null;
  }
  if (input.logDate < input.cycleStartDate || input.logDate > input.cycleEndDate) {
    return null;
  }
  const [sy, sm, sd] = input.cycleStartDate.split("-").map(Number);
  const [ly, lm, ld] = input.logDate.split("-").map(Number);
  return Math.floor((Date.UTC(ly, lm - 1, ld) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
}

export function coachingAiV2LifecycleStage(dayNumber: number | null): CoachingAiV2LifecycleStage {
  if (dayNumber == null) return "post_cycle";
  if (dayNumber <= 3) return "understand";
  if (dayNumber <= 7) return "find_patterns";
  if (dayNumber <= 14) return "experiment";
  if (dayNumber <= 20) return "build_autonomy";
  if (dayNumber === 21) return "day21_ending";
  return "post_cycle";
}

export function buildLifecycleSnapshot(input: {
  cycle: CoachingAiV2Cycle | null;
  logDate: string;
}): CoachingAiV2LifecycleSnapshot {
  if (!input.cycle || input.cycle.status === "cancelled") {
    return {
      cycle: input.cycle,
      dayNumber: null,
      stage: "post_cycle",
      intensiveActive: false,
      daysRemaining: null,
    };
  }
  if (input.cycle.status === "completed") {
    return {
      cycle: input.cycle,
      dayNumber: null,
      stage: "post_cycle",
      intensiveActive: false,
      daysRemaining: 0,
    };
  }
  const dayNumber = coachingAiV2DayNumber({
    cycleStartDate: input.cycle.startDate,
    cycleEndDate: input.cycle.plannedEndDate,
    logDate: input.logDate,
  });
  const stage = coachingAiV2LifecycleStage(dayNumber);
  const intensiveActive =
    input.cycle.status === "active" && dayNumber != null && stage !== "post_cycle";
  const daysRemaining =
    dayNumber == null ? null : Math.max(0, COACHING_AI_V2_CYCLE_DAYS - dayNumber);
  return {
    cycle: input.cycle,
    dayNumber,
    stage,
    intensiveActive,
    daysRemaining,
  };
}

export function lifecycleStageGuidance(stage: CoachingAiV2LifecycleStage): string {
  switch (stage) {
    case "understand":
      return "Days 1–3 — mostly understand. Observe more than intervene.";
    case "find_patterns":
      return "Days 4–7 — notice patterns when evidence supports them. Day 7: light goal-anchored reflection only with real evidence.";
    case "experiment":
      return "Days 8–14 — small experiments when useful. Day 14: brief evidence-based check-in against the goal.";
    case "build_autonomy":
      return "Days 15–20 — help the customer notice and decide; don't quiz every turn.";
    case "day21_ending":
      return "Day 21 — close the loop: original wish → what actually happened (evidence) → what to continue. Not graduation fluff.";
    case "post_cycle":
      return "Post-cycle — brief; escalate to human coach when needed.";
  }
}
