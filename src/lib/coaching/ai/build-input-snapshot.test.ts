import { describe, expect, it } from "vitest";
import { buildCoachingInputSnapshot, mapCoachDirectivesRecord } from "@/lib/coaching/ai/build-input-snapshot";
import { fingerprintCoachingInputSnapshot } from "@/lib/ai/input-fingerprint";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

function enrollment(overrides?: Partial<CoachingEnrollment>): CoachingEnrollment {
  return {
    id: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "member-1",
    goal: "健康減脂",
    status: "active",
    startedAt: "2026-07-28T00:00:00.000Z",
    endedAt: null,
    onboardingCompletedAt: "2026-07-28T01:00:00.000Z",
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: "body-baseline",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function customer(): Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation"> {
  return {
    displayName: "Amy",
    heightCm: 165,
    sex: "female",
    region: "台北",
    occupation: "設計師",
  };
}

function dailyLog(logDate: string, overrides?: Partial<CoachingDailyLogDetail>): CoachingDailyLogDetail {
  return {
    id: `log-${logDate}`,
    enrollmentId: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "member-1",
    logDate,
    waterMl: 1800,
    exerciseNote: "快走",
    bowelMovementCount: 1,
    sleepDuration: "7小時30分",
    sleepBedtime: "23:30",
    sleepWakeTime: "07:00",
    customerNote: "今天狀態不錯",
    submittedAt: `${logDate}T10:00:00.000Z`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meals: [
      {
        id: "breakfast-1",
        dailyLogId: `log-${logDate}`,
        mealSlot: "breakfast",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: { id: "photo-1", mealEntryId: "breakfast-1", storagePath: "cust/enroll/date/breakfast/x.jpg", uploadedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
      },
      {
        id: "lunch-1",
        dailyLogId: `log-${logDate}`,
        mealSlot: "lunch",
        textNote: "雞胸",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: null,
      },
    ],
    ...overrides,
  };
}

const bodyBaseline: BodyCompositionRecord = {
  id: "body-baseline",
  customerId: "cust-1",
  recordDate: "2026-07-28",
  age: 32,
  weightKg: 62,
  skeletalMuscleKg: 24,
  bodyFatKg: 18,
  bmi: 22.8,
  bodyFatPercent: 29,
  visceralFatLevel: 8,
  basalMetabolicRate: 1300,
  bodyAge: 34,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const bodyLatest: BodyCompositionRecord = {
  ...bodyBaseline,
  id: "body-latest",
  recordDate: "2026-08-11",
  weightKg: 60.5,
  bodyFatPercent: 27.5,
  visceralFatLevel: 7,
};

describe("buildCoachingInputSnapshot", () => {
  it("builds all memory layers without chat history", () => {
    const today = dailyLog("2026-08-11");
    const recent = [
      today,
      dailyLog("2026-08-10", { waterMl: 1200, sleepBedtime: "00:30", sleepWakeTime: "07:30", sleepDuration: "7小時", submittedAt: null }),
      dailyLog("2026-08-09", { waterMl: null, exerciseNote: null, bowelMovementCount: null, customerNote: null, submittedAt: null, meals: [] }),
    ];

    const snapshot = buildCoachingInputSnapshot({
      enrollment: enrollment(),
      customer: customer(),
      logDate: "2026-08-11",
      todayLog: today,
      recentLogs: recent,
      bodyRecords: [bodyLatest, bodyBaseline],
      coachDirectives: mapCoachDirectivesRecord({
        currentFocus: "早餐",
        currentPriority: "水量",
        coachInstruction: "這週先改善早餐",
        effectiveFrom: "2026-08-11",
      }),
      builtAt: "2026-08-11T12:00:00.000Z",
    });

    expect(snapshot.version).toBe(1);
    expect(snapshot.profileMemory.goal).toBe("健康減脂");
    expect(snapshot.profileMemory.baselineMeasurement?.weightKg).toBe(62);
    expect(snapshot.coachDirectives?.coachInstruction).toBe("這週先改善早餐");
    expect(snapshot.todayContext.meals[0]?.hasPhoto).toBe(true);
    expect(snapshot.todayContext.meals[0]?.photoStoragePath).toContain("breakfast");
    expect(snapshot.rollingMemory.aggregates.windowDays).toBe(14);
    expect(snapshot.rollingMemory.recentDays.length).toBeLessThanOrEqual(3);
    expect(snapshot.outcomeMemory.latestMeasurement?.weightKg).toBe(60.5);
    expect(snapshot.outcomeMemory.trendDeltas.length).toBeGreaterThan(0);
    expect(snapshot.rollingMemory.recurringPatterns.length).toBeGreaterThan(0);

    const fingerprint = fingerprintCoachingInputSnapshot(snapshot);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null coach directives when empty", () => {
    expect(mapCoachDirectivesRecord(null)).toBeNull();
    expect(mapCoachDirectivesRecord({ currentFocus: "  " })).toBeNull();
  });
});
