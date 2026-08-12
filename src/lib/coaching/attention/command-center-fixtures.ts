import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CommandCenterBatchCustomer } from "@/lib/coaching/attention/assemble-command-center";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";

function enrollment(input: {
  id: string;
  ownerMemberId: string;
  customerId: string;
  goal?: string;
  startedAt: string;
  baselineBodyRecordId?: string | null;
}): CoachingEnrollment {
  return {
    id: input.id,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    goal: input.goal ?? "健康減脂",
    status: "active",
    startedAt: input.startedAt,
    endedAt: null,
    onboardingCompletedAt: input.startedAt,
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: input.baselineBodyRecordId ?? null,
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
  };
}

function log(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  submitted?: boolean;
  sleepBedtime?: string | null;
  customerNote?: string | null;
}): CoachingDailyLogDetail {
  return {
    id: `${input.enrollmentId}-${input.logDate}`,
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    logDate: input.logDate,
    waterMl: 4000,
    exerciseNote: "快走",
    bowelMovementCount: 1,
    sleepDuration: "7小時",
    sleepBedtime: input.sleepBedtime ?? "22:30",
    sleepWakeTime: "06:00",
    customerNote: input.customerNote ?? null,
    submittedAt: input.submitted === false ? null : `${input.logDate}T10:00:00.000Z`,
    createdAt: `${input.logDate}T08:00:00.000Z`,
    updatedAt: `${input.logDate}T10:00:00.000Z`,
    meals: [
      {
        id: `${input.enrollmentId}-${input.logDate}-b`,
        dailyLogId: `${input.enrollmentId}-${input.logDate}`,
        mealSlot: "breakfast",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: `${input.logDate}T08:00:00.000Z`,
        updatedAt: `${input.logDate}T08:00:00.000Z`,
        photo: null,
      },
      {
        id: `${input.enrollmentId}-${input.logDate}-l`,
        dailyLogId: `${input.enrollmentId}-${input.logDate}`,
        mealSlot: "lunch",
        textNote: "雞胸沙拉",
        eatenAt: null,
        createdAt: `${input.logDate}T08:00:00.000Z`,
        updatedAt: `${input.logDate}T08:00:00.000Z`,
        photo: null,
      },
      {
        id: `${input.enrollmentId}-${input.logDate}-d`,
        dailyLogId: `${input.enrollmentId}-${input.logDate}`,
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

function shift(asOf: string, days: number): string {
  const [y, m, d] = asOf.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function body(input: {
  id: string;
  customerId: string;
  recordDate: string;
  weightKg?: number;
  bodyFatPercent?: number;
}): BodyCompositionRecord {
  return {
    id: input.id,
    customerId: input.customerId,
    recordDate: input.recordDate,
    age: null,
    weightKg: input.weightKg ?? 80,
    skeletalMuscleKg: 28,
    bodyFatKg: null,
    bmi: 28,
    bodyFatPercent: input.bodyFatPercent ?? 32,
    visceralFatLevel: 10,
    basalMetabolicRate: null,
    bodyAge: null,
    createdAt: `${input.recordDate}T00:00:00.000Z`,
    updatedAt: `${input.recordDate}T00:00:00.000Z`,
  };
}

function filledLogs(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  asOf: string;
  days: number;
  missOffsets?: number[];
  lateSleep?: boolean;
}): CoachingDailyLogDetail[] {
  const miss = new Set(input.missOffsets ?? []);
  const out: CoachingDailyLogDetail[] = [];
  for (let i = 0; i < input.days; i += 1) {
    out.push(
      log({
        enrollmentId: input.enrollmentId,
        customerId: input.customerId,
        ownerMemberId: input.ownerMemberId,
        logDate: shift(input.asOf, -i),
        submitted: !miss.has(i),
        sleepBedtime: input.lateSleep ? "01:00" : "22:30",
      }),
    );
  }
  return out;
}

/** Realistic 30-customer Command Center fixture for UX + ranking sanity. */
export function buildCommandCenter30Fixture(input?: {
  asOfLogDate?: string;
  ownerMemberId?: string;
  otherOwnerMemberId?: string;
}): CommandCenterBatchCustomer[] {
  const asOf = input?.asOfLogDate ?? "2026-08-12";
  const owner = input?.ownerMemberId ?? "owner-a";
  const other = input?.otherOwnerMemberId ?? "owner-b";
  const customers: CommandCenterBatchCustomer[] = [];

  // 2 needs attention — 7+ day missing
  for (let i = 0; i < 2; i += 1) {
    const id = `attn-${i}`;
    const customerId = `cust-attn-${i}`;
    customers.push({
      enrollment: enrollment({
        id,
        ownerMemberId: owner,
        customerId,
        startedAt: shift(asOf, -40),
        baselineBodyRecordId: `body-${id}`,
      }),
      displayName: i === 0 ? "需要處理甲" : "需要處理乙",
      phone: `09000000${i}`,
      logs: filledLogs({
        enrollmentId: id,
        customerId,
        ownerMemberId: owner,
        asOf,
        days: 14,
        missOffsets: [0, 1, 2, 3, 4, 5, 6, 7],
      }),
      bodyRecords: [body({ id: `body-${id}`, customerId, recordDate: shift(asOf, -5) })],
      latestAiOutput: null,
    });
  }

  // 4 watch — mix of 2-day and 5-day missing + late sleep
  for (let i = 0; i < 4; i += 1) {
    const id = `watch-${i}`;
    const customerId = `cust-watch-${i}`;
    const missDays = i < 2 ? 5 : 2;
    customers.push({
      enrollment: enrollment({
        id,
        ownerMemberId: owner,
        customerId,
        startedAt: shift(asOf, -30),
        baselineBodyRecordId: `body-${id}`,
      }),
      displayName: i < 2 ? `觀察五天${i}` : `觀察兩天${i}`,
      phone: `09110000${i}`,
      logs: filledLogs({
        enrollmentId: id,
        customerId,
        ownerMemberId: owner,
        asOf,
        days: 14,
        missOffsets: Array.from({ length: missDays }, (_, idx) => idx),
        lateSleep: i === 0,
      }),
      bodyRecords: [body({ id: `body-${id}`, customerId, recordDate: shift(asOf, -3) })],
      latestAiOutput: null,
    });
  }

  // 3 measurement due — baseline only, latest >= 14 days
  for (let i = 0; i < 3; i += 1) {
    const id = `measure-${i}`;
    const customerId = `cust-measure-${i}`;
    customers.push({
      enrollment: enrollment({
        id,
        ownerMemberId: owner,
        customerId,
        startedAt: shift(asOf, -20),
        baselineBodyRecordId: `body-${id}`,
      }),
      displayName: `建議回測${i}`,
      phone: `09220000${i}`,
      logs: filledLogs({
        enrollmentId: id,
        customerId,
        ownerMemberId: owner,
        asOf,
        days: 14,
      }),
      bodyRecords: [body({ id: `body-${id}`, customerId, recordDate: shift(asOf, -(14 + i)) })],
      latestAiOutput: null,
    });
  }

  // 8 positive / improving-ish with two measurements
  for (let i = 0; i < 8; i += 1) {
    const id = `pos-${i}`;
    const customerId = `cust-pos-${i}`;
    customers.push({
      enrollment: enrollment({
        id,
        ownerMemberId: owner,
        customerId,
        startedAt: shift(asOf, -45),
        baselineBodyRecordId: `body-${id}-b`,
      }),
      displayName: `進展良好${i}`,
      phone: `09330000${i}`,
      logs: filledLogs({
        enrollmentId: id,
        customerId,
        ownerMemberId: owner,
        asOf,
        days: 14,
      }),
      bodyRecords: [
        body({
          id: `body-${id}-l`,
          customerId,
          recordDate: shift(asOf, -2),
          weightKg: 78,
          bodyFatPercent: 30,
        }),
        body({
          id: `body-${id}-b`,
          customerId,
          recordDate: shift(asOf, -30),
          weightKg: 82,
          bodyFatPercent: 33,
        }),
      ],
      latestAiOutput: null,
    });
  }

  // remaining routine
  while (customers.length < 30) {
    const i = customers.length;
    const id = `routine-${i}`;
    const customerId = `cust-routine-${i}`;
    customers.push({
      enrollment: enrollment({
        id,
        ownerMemberId: owner,
        customerId,
        startedAt: shift(asOf, -10),
        baselineBodyRecordId: `body-${id}`,
      }),
      displayName: `例行${i}`,
      phone: `09440000${i % 10}`,
      logs: filledLogs({
        enrollmentId: id,
        customerId,
        ownerMemberId: owner,
        asOf,
        days: 10,
      }),
      bodyRecords: [body({ id: `body-${id}`, customerId, recordDate: shift(asOf, -2) })],
      latestAiOutput: null,
    });
  }

  // Unauthorized other-owner customer (must be filtered out by assemble)
  customers.push({
    enrollment: enrollment({
      id: "other-owner",
      ownerMemberId: other,
      customerId: "cust-other",
      startedAt: shift(asOf, -20),
    }),
    displayName: "未授權學員",
    phone: "0999999999",
    logs: filledLogs({
      enrollmentId: "other-owner",
      customerId: "cust-other",
      ownerMemberId: other,
      asOf,
      days: 7,
      missOffsets: [0, 1, 2, 3, 4, 5, 6],
    }),
    bodyRecords: [],
    latestAiOutput: null,
  });

  return customers;
}
