import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";

export type CoachingAiFixtureScenario =
  | "A_normal"
  | "B_breakfast_deviation"
  | "C_watch_pattern"
  | "D_hunger_shake_fried_rice"
  | "E_full_day_off_track"
  | "F_single_meal_fried"
  | "G_shake_hunger"
  | "H_on_track_day"
  | "I_baseline_only_fat_loss"
  | "J_second_measurement_improving"
  | "K_weight_down_muscle_loss"
  | "L_recomposition"
  | "M_baseline_only_day10"
  | "N_two_periods_flat";

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
  options?: { withPhoto?: boolean },
): CoachingDailyLogDetail["meals"][number] {
  return {
    id: `${slot}-entry`,
    dailyLogId: "fixture-log",
    mealSlot: slot,
    textNote,
    eatenAt: null,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
    photo: options?.withPhoto
      ? {
          id: `${slot}-photo`,
          mealEntryId: `${slot}-entry`,
          storagePath: `eval-fixtures/${slot}.jpg`,
          uploadedAt: "2026-08-11T08:00:00.000Z",
          createdAt: "2026-08-11T08:00:00.000Z",
        }
      : null,
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


function bodyRecord(
  id: string,
  recordDate: string,
  values: {
    weightKg: number;
    bodyFatPercent: number;
    skeletalMuscleKg: number;
    visceralFatLevel: number;
  },
) {
  return {
    id,
    customerId: FIXTURE_ENROLLMENT.customerId,
    recordDate,
    age: null as number | null,
    weightKg: values.weightKg,
    skeletalMuscleKg: values.skeletalMuscleKg,
    bodyFatKg: null as number | null,
    bmi: null as number | null,
    bodyFatPercent: values.bodyFatPercent,
    visceralFatLevel: values.visceralFatLevel,
    basalMetabolicRate: null as number | null,
    bodyAge: null as number | null,
    createdAt: `${recordDate}T00:00:00.000Z`,
    updatedAt: `${recordDate}T00:00:00.000Z`,
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

  if (scenario === "D_hunger_shake_fried_rice") {
    const plan = cloneDefaultCoachingPlanSnapshot();
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-d",
      planSnapshot: {
        ...plan,
        dailyInstructions: {
          ...plan.dailyInstructions,
          hydration: ["每天喝水 5000 ml"],
        },
      },
    };
    const todayLog = baseLog({
      waterMl: 3000,
      exerciseNote: "1 小時",
      bowelMovementCount: 2,
      sleepBedtime: "00:24",
      sleepWakeTime: "08:24",
      sleepDuration: "8小時",
      customerNote: "還是會很餓",
      meals: [
        meal("breakfast", "喝奶昔", { withPhoto: true }),
        meal("lunch", "炒飯", { withPhoto: true }),
        meal("dinner", "喝奶昔", { withPhoto: true }),
      ],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "合成評測", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  if (scenario === "E_full_day_off_track") {
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "炒飯", { withPhoto: true }),
        meal("lunch", "roti + curry", { withPhoto: true }),
        meal("dinner", "肉骨 + 炸物", { withPhoto: true }),
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

  if (scenario === "F_single_meal_fried") {
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "雞胸蛋青菜"),
        meal("lunch", "雞胸便當"),
        meal("dinner", "炸雞", { withPhoto: true }),
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

  if (scenario === "G_shake_hunger") {
    const todayLog = baseLog({
      customerNote: "還是會很餓",
      meals: [
        meal("breakfast", "喝奶昔", { withPhoto: true }),
        meal("lunch", "雞胸沙拉"),
        meal("dinner", "喝奶昔", { withPhoto: true }),
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

  if (scenario === "H_on_track_day") {
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "奶昔 + 蛋"),
        meal("lunch", "雞胸沙拉"),
        meal("dinner", "魚 + 青菜 + 一小碗飯"),
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


  if (scenario === "I_baseline_only_fat_loss" || scenario === "M_baseline_only_day10") {
    const logDate = scenario === "M_baseline_only_day10" ? "2026-07-11" : "2026-07-08";
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-i",
      goal: "健康減脂",
      baselineBodyRecordId: "body-b1",
    };
    const todayLog = baseLog({
      logDate,
      enrollmentId: enrollment.id,
      waterMl: 1200,
      meals: [
        meal("breakfast", "炒飯", { withPhoto: true }),
        meal("lunch", "roti + curry", { withPhoto: true }),
        meal("dinner", "炸雞", { withPhoto: true }),
      ],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate,
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [
          bodyRecord("body-b1", "2026-07-01", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
        ],
        builtAt: `${logDate}T12:00:00.000Z`,
      }),
    };
  }

  if (scenario === "J_second_measurement_improving") {
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-j",
      goal: "健康減脂",
      baselineBodyRecordId: "body-b1",
    };
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "奶昔 + 蛋"),
        meal("lunch", "雞胸沙拉"),
        meal("dinner", "魚 + 青菜"),
      ],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [
          bodyRecord("body-b2", "2026-08-10", {
            weightKg: 87.8,
            bodyFatPercent: 33.5,
            skeletalMuscleKg: 30.1,
            visceralFatLevel: 14,
          }),
          bodyRecord("body-b1", "2026-07-01", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
        ],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  if (scenario === "K_weight_down_muscle_loss") {
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-k",
      goal: "健康減脂",
      baselineBodyRecordId: "body-b1",
    };
    const todayLog = baseLog({
      meals: [meal("breakfast", "奶昔"), meal("lunch", "清湯麵"), meal("dinner", "奶昔")],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [
          bodyRecord("body-b2", "2026-08-10", {
            weightKg: 86,
            bodyFatPercent: 34.8,
            skeletalMuscleKg: 27.5,
            visceralFatLevel: 15,
          }),
          bodyRecord("body-b1", "2026-07-01", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
        ],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  if (scenario === "L_recomposition") {
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-l",
      goal: "健康減脂",
      baselineBodyRecordId: "body-b1",
    };
    const todayLog = baseLog({
      meals: [
        meal("breakfast", "奶昔 + 蛋"),
        meal("lunch", "雞胸沙拉"),
        meal("dinner", "魚 + 青菜 + 一小碗飯"),
      ],
    });
    return {
      finalInterventionLevel: "normal",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-08-11",
        todayLog,
        recentLogs: [todayLog],
        bodyRecords: [
          bodyRecord("body-b2", "2026-08-10", {
            weightKg: 90.5,
            bodyFatPercent: 32,
            skeletalMuscleKg: 32,
            visceralFatLevel: 13,
          }),
          bodyRecord("body-b1", "2026-07-01", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
        ],
        builtAt: "2026-08-11T12:00:00.000Z",
      }),
    };
  }

  if (scenario === "N_two_periods_flat") {
    const enrollment: CoachingEnrollment = {
      ...FIXTURE_ENROLLMENT,
      id: "fixture-enroll-n",
      goal: "健康減脂",
      baselineBodyRecordId: "body-b1",
    };
    const todayLog = baseLog({
      logDate: "2026-07-31",
      sleepBedtime: "01:00",
      sleepWakeTime: "08:00",
      sleepDuration: "7小時",
      meals: [meal("breakfast", "蛋餅"), meal("lunch", "便當"), meal("dinner", "火鍋")],
    });
    const recent = [
      todayLog,
      baseLog({
        logDate: "2026-07-30",
        sleepBedtime: "01:10",
        meals: [meal("breakfast", "奶茶"), meal("lunch", "便當"), meal("dinner", "火鍋")],
      }),
      baseLog({
        logDate: "2026-07-29",
        sleepBedtime: "01:20",
        meals: [meal("breakfast", null), meal("lunch", "便當"), meal("dinner", "炸物")],
      }),
    ];
    return {
      finalInterventionLevel: "watch",
      generationInput: buildCoachingGenerationInput({
        enrollment,
        customer: { displayName: "小安", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
        logDate: "2026-07-31",
        todayLog,
        recentLogs: recent,
        bodyRecords: [
          bodyRecord("body-b3", "2026-07-30", {
            weightKg: 90.1,
            bodyFatPercent: 35.1,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
          bodyRecord("body-b2", "2026-07-15", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
          bodyRecord("body-b1", "2026-07-01", {
            weightKg: 90,
            bodyFatPercent: 35,
            skeletalMuscleKg: 30,
            visceralFatLevel: 15,
          }),
        ],
        builtAt: "2026-07-31T12:00:00.000Z",
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
  const notes = input.todayContext.primaryMeals.map((item) => item.textNote ?? "").join("|");
  if (notes.includes("炒飯") && notes.includes("roti") && notes.includes("炸物")) {
    return "E_full_day_off_track";
  }
  if (notes.includes("炸雞") && notes.includes("雞胸便當")) {
    return "F_single_meal_fried";
  }
  if (
    input.todayContext.customerNote?.includes("還是會很餓") &&
    notes.includes("喝奶昔") &&
    !notes.includes("炒飯")
  ) {
    return "G_shake_hunger";
  }
  if (notes.includes("魚 + 青菜") || notes.includes("一小碗飯")) {
    return "H_on_track_day";
  }
  if (input.todayContext.customerNote?.includes("還是會很餓")) {
    return "D_hunger_shake_fried_rice";
  }

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
