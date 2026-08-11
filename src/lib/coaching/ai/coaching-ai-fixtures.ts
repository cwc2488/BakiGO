import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";

export type CoachingAiFixtureScenario = "A_normal" | "B_breakfast_deviation" | "C_watch_pattern";

const FIXTURE_ENROLLMENT: CoachingEnrollment = {
  id: "fixture-enroll",
  customerId: "fixture-cust",
  ownerMemberId: "fixture-member",
  goal: "健康減脂",
  status: "active",
  startedAt: "2026-07-01T00:00:00.000Z",
  endedAt: null,
  onboardingCompletedAt: "2026-07-01T01:00:00.000Z",
  planSnapshot: cloneDefaultCoachingPlanSnapshot(),
  baselineBodyRecordId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function meal(
  slot: CoachingDailyLogDetail["meals"][number]["mealSlot"],
  textNote: string | null,
): CoachingDailyLogDetail["meals"][number] {
  return {
    id: `${slot}-entry`,
    dailyLogId: "fixture-log",
    mealSlot: slot,
    textNote,
    eatenAt: null,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
    photo: null,
  };
}

function baseLog(overrides?: Partial<CoachingDailyLogDetail>): CoachingDailyLogDetail {
  return {
    id: "fixture-log",
    enrollmentId: FIXTURE_ENROLLMENT.id,
    customerId: FIXTURE_ENROLLMENT.customerId,
    ownerMemberId: FIXTURE_ENROLLMENT.ownerMemberId,
    logDate: "2026-08-11",
    waterMl: 1800,
    exerciseNote: "快走 20 分",
    bowelMovementCount: 1,
    sleepDuration: "7小時30分",
    sleepBedtime: "23:00",
    sleepWakeTime: "06:30",
    customerNote: null,
    submittedAt: "2026-08-11T10:00:00.000Z",
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T10:00:00.000Z",
    meals: [],
    ...overrides,
  };
}

export function buildCoachingAiFixtureGenerationInput(
  scenario: CoachingAiFixtureScenario,
): { generationInput: CoachingGenerationInput; finalInterventionLevel: CoachingInterventionLevel } {
  if (scenario === "A_normal") {
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "奶昔"),
        meal("lunch", "雞胸沙拉"),
        meal("dinner", "奶昔 + 青菜"),
      ],
    });
    const recent = [
      todayLog,
      baseLog({ logDate: "2026-08-10", meals: [meal("breakfast", "奶昔"), meal("lunch", "便當"), meal("dinner", "奶昔")] }),
      baseLog({ logDate: "2026-08-09", meals: [meal("breakfast", "奶昔"), meal("lunch", "雞肉"), meal("dinner", "奶昔")] }),
    ];
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment: FIXTURE_ENROLLMENT,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: recent,
        bodyRecords: [],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  if (scenario === "B_breakfast_deviation") {
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "蛋餅 + 奶茶"),
        meal("lunch", "雞胸便當"),
        meal("dinner", "奶昔 + 燙青菜"),
      ],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment: FIXTURE_ENROLLMENT,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  const todayLog = baseLog({
    sleepBedtime: "00:45",
    sleepWakeTime: "07:30",
    sleepDuration: "6小時45分",
    meals: [meal("breakfast", "來不及，只喝水"), meal("lunch", "便當"), meal("dinner", "外食火鍋")],
  });
  const recent = [
    todayLog,
    baseLog({
      logDate: "2026-08-10",
      sleepBedtime: "00:30",
      sleepWakeTime: "07:00",
      meals: [meal("breakfast", "跳過"), meal("lunch", "麵包"), meal("dinner", "外食")],
    }),
    baseLog({
      logDate: "2026-08-09",
      sleepBedtime: "01:00",
      sleepWakeTime: "07:15",
      meals: [meal("breakfast", "沒吃"), meal("lunch", "便當"), meal("dinner", "宵夜")],
    }),
  ];

  return {
    finalInterventionLevel: "watch",
    generationInput: buildCoachingGenerationInput({
      enrollment: FIXTURE_ENROLLMENT,
      customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
      logDate: "2026-08-11",
      todayLog,
      recentLogs: recent,
      bodyRecords: [],
      builtAt: "2026-08-11T12:00:00.000Z",
    }),
  };
}

export function detectCoachingAiFixtureScenario(input: CoachingGenerationInput): CoachingAiFixtureScenario {
  const breakfastNote =
    input.todayContext.primaryMeals.find((item) => item.mealSlot === "breakfast")?.textNote ?? "";
  if (breakfastNote.includes("蛋餅") || breakfastNote.includes("奶茶")) {
    return "B_breakfast_deviation";
  }

  const lateSleepDays = input.rollingMemory.aggregates.lateSleepDays ?? 0;
  const breakfastMissPattern = input.rollingMemory.recurringPatterns.includes("breakfast_often_missed");
  if (lateSleepDays >= 2 || breakfastMissPattern) {
    return "C_watch_pattern";
  }

  return "A_normal";
}
