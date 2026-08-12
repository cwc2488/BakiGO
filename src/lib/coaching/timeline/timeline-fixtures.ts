import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { CoachingAiOutputRecord } from "@/types/coaching-ai";
import type { BodyCompositionRecord } from "@/types/customer";
import type { TimelineBuildInput } from "@/lib/coaching/timeline/build-timeline-events";

function shift(asOf: string, days: number): string {
  const [y, m, d] = asOf.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function enrollment(startedAt: string): CoachingEnrollment {
  return {
    id: "tl-enroll",
    customerId: "tl-cust",
    ownerMemberId: "tl-owner",
    goal: "健康減脂",
    status: "active",
    startedAt,
    endedAt: null,
    onboardingCompletedAt: startedAt,
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: "body-baseline",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function log(input: {
  logDate: string;
  submitted?: boolean;
  note?: string | null;
  sleepBedtime?: string | null;
  aiFailedDay?: boolean;
}): CoachingDailyLogDetail {
  return {
    id: `log-${input.logDate}`,
    enrollmentId: "tl-enroll",
    customerId: "tl-cust",
    ownerMemberId: "tl-owner",
    logDate: input.logDate,
    waterMl: 3500,
    exerciseNote: "快走",
    bowelMovementCount: 1,
    sleepDuration: "7小時",
    sleepBedtime: input.sleepBedtime ?? "22:40",
    sleepWakeTime: "06:10",
    customerNote: input.note ?? null,
    submittedAt: input.submitted === false ? null : `${input.logDate}T12:00:00.000Z`,
    createdAt: `${input.logDate}T08:00:00.000Z`,
    updatedAt: `${input.logDate}T12:00:00.000Z`,
    meals: [
      {
        id: `m-b-${input.logDate}`,
        dailyLogId: `log-${input.logDate}`,
        mealSlot: "breakfast",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: `${input.logDate}T08:00:00.000Z`,
        updatedAt: `${input.logDate}T08:00:00.000Z`,
        photo: {
          id: `p-b-${input.logDate}`,
          mealEntryId: `m-b-${input.logDate}`,
          storagePath: `tl-cust/tl-enroll/${input.logDate}/breakfast/p.jpg`,
          uploadedAt: `${input.logDate}T08:00:00.000Z`,
          createdAt: `${input.logDate}T08:00:00.000Z`,
        },
      },
      {
        id: `m-l-${input.logDate}`,
        dailyLogId: `log-${input.logDate}`,
        mealSlot: "lunch",
        textNote: "雞胸沙拉",
        eatenAt: null,
        createdAt: `${input.logDate}T08:00:00.000Z`,
        updatedAt: `${input.logDate}T08:00:00.000Z`,
        photo: null,
      },
      {
        id: `m-d-${input.logDate}`,
        dailyLogId: `log-${input.logDate}`,
        mealSlot: "dinner",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: `${input.logDate}T08:00:00.000Z`,
        updatedAt: `${input.logDate}T08:00:00.000Z`,
        photo: null,
      },
    ],
  };
}

function ai(input: {
  logDate: string;
  status?: "completed" | "failed";
  level?: "normal" | "watch" | "coach_attention";
  feedback?: string;
}): CoachingAiOutputRecord {
  const status = input.status ?? "completed";
  return {
    id: `ai-${input.logDate}`,
    enrollmentId: "tl-enroll",
    customerId: "tl-cust",
    ownerMemberId: "tl-owner",
    logDate: input.logDate,
    pointKey: "daily_coach_generation",
    inputFingerprint: "fp",
    inputSnapshot: {} as CoachingAiOutputRecord["inputSnapshot"],
    outputJson:
      status === "completed"
        ? {
            version: 1,
            customer: {
              encouragement: "加油",
              today_feedback: input.feedback ?? "今天執行不錯",
              daily_food_summary: "三餐完整",
              meal_feedback: { breakfast: null, lunch: null, dinner: null },
              lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
              customer_voice_response: null,
              adjustment_priorities: ["改善飽足感"],
              tomorrow_focus: "改善飽足感",
              follow_up_for_tomorrow: null,
            },
            coach: {
              daily_summary: "整體穩定",
              recurring_issue: null,
              improved_issue: null,
              proposed_intervention_level: input.level ?? "normal",
              coach_attention_required: false,
              attention_reason: null,
              evidence: [],
              follow_ups: [],
              photo_reuse_flags: [],
              daily_nutrition_assessment: null,
            },
          }
        : null,
    model: "fixture",
    promptVersion: "fixture",
    status,
    errorMessage: status === "failed" ? "provider_error" : null,
    regenerationCount: 0,
    aiProposedInterventionLevel: input.level ?? "normal",
    finalInterventionLevel: status === "completed" ? input.level ?? "normal" : null,
    startedAt: `${input.logDate}T12:05:00.000Z`,
    completedAt: `${input.logDate}T12:06:00.000Z`,
    createdAt: `${input.logDate}T12:05:00.000Z`,
    updatedAt: `${input.logDate}T12:06:00.000Z`,
  };
}

function body(id: string, recordDate: string, values: { weightKg: number; bodyFatPercent: number; skeletalMuscleKg: number }): BodyCompositionRecord {
  return {
    id,
    customerId: "tl-cust",
    recordDate,
    age: null,
    weightKg: values.weightKg,
    skeletalMuscleKg: values.skeletalMuscleKg,
    bodyFatKg: null,
    bmi: 28,
    bodyFatPercent: values.bodyFatPercent,
    visceralFatLevel: 12,
    basalMetabolicRate: null,
    bodyAge: null,
    createdAt: `${recordDate}T00:00:00.000Z`,
    updatedAt: `${recordDate}T00:00:00.000Z`,
  };
}

/** Realistic 28-day journey for 60-second UX + TL golden scenarios. */
export function buildTimeline28DayFixture(asOfLogDate = "2026-08-12"): TimelineBuildInput & {
  enrollment: CoachingEnrollment;
} {
  const startedAt = `${shift(asOfLogDate, -27)}T00:00:00.000Z`;
  const startDate = startedAt.slice(0, 10);
  const enroll = enrollment(startedAt);

  const logs: CoachingDailyLogDetail[] = [];
  const aiOutputs: CoachingAiOutputRecord[] = [];

  // Day 1..28 relative: include missing streak, late sleep, hunger, AI failure
  for (let offset = 27; offset >= 0; offset -= 1) {
    const logDate = shift(asOfLogDate, -offset);
    // Missing streak: days offset 20..14 (7 days)
    if (offset <= 20 && offset >= 14) {
      continue;
    }
    const late = offset <= 6 && offset !== 5 && offset !== 3; // several late nights recently
    const hunger = offset === 2 || offset === 4 || offset === 6;
    const failed = offset === 1;
    logs.push(
      log({
        logDate,
        note: hunger ? "還是會很餓" : offset === 0 ? "今天狀態不錯" : null,
        sleepBedtime: late ? "00:31" : "22:40",
      }),
    );
    aiOutputs.push(
      ai({
        logDate,
        status: failed ? "failed" : "completed",
        level: offset <= 5 ? "watch" : "normal",
        feedback: hunger ? "先回應你提到的飢餓感" : "今天執行不錯",
      }),
    );
  }

  const bodyRecords = [
    body("body-baseline", startDate, { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30 }),
    body("body-second", shift(asOfLogDate, -3), {
      weightKg: 87.8,
      bodyFatPercent: 33.5,
      skeletalMuscleKg: 30.1,
    }),
  ];

  return {
    enrollment: enroll,
    enrollmentId: enroll.id,
    enrollmentStartedAt: enroll.startedAt,
    baselineBodyRecordId: enroll.baselineBodyRecordId,
    asOfLogDate,
    journeyStartDate: startDate,
    logs,
    aiOutputs,
    bodyRecords,
    focusDates: [shift(asOfLogDate, 0), shift(asOfLogDate, -2), shift(asOfLogDate, -4), shift(asOfLogDate, -6)],
    reasonCodes: ["recurring_late_sleep", "customer_voice_recurring_hunger"],
  };
}
