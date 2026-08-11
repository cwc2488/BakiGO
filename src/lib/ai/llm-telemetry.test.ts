import { describe, expect, it } from "vitest";
import { buildLlmCallLogEntry } from "@/lib/ai/llm-telemetry";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";

const enrollment: CoachingEnrollment = {
  id: "enroll-1",
  customerId: "cust-1",
  ownerMemberId: "member-1",
  goal: "健康",
  status: "active",
  startedAt: "2026-07-28T00:00:00.000Z",
  endedAt: null,
  onboardingCompletedAt: null,
  planSnapshot: cloneDefaultCoachingPlanSnapshot(),
  baselineBodyRecordId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const todayLog: CoachingDailyLogDetail = {
  id: "log-1",
  enrollmentId: "enroll-1",
  customerId: "cust-1",
  ownerMemberId: "member-1",
  logDate: "2026-08-11",
  waterMl: 1500,
  exerciseNote: null,
  bowelMovementCount: null,
  sleepDuration: null,
  sleepBedtime: null,
  sleepWakeTime: null,
  customerNote: null,
  submittedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  meals: [],
};

describe("llm telemetry", () => {
  it("builds append-only log entry with estimated cost", () => {
    const snapshot = buildCoachingGenerationInput({
      enrollment,
      customer: { displayName: "Amy", heightCm: undefined, sex: undefined, region: undefined, occupation: undefined },
      logDate: "2026-08-11",
      todayLog,
      recentLogs: [todayLog],
      bodyRecords: [],
    });

    const entry = buildLlmCallLogEntry({
      feature: "coaching",
      pointKey: "daily_coach_generation",
      customerId: "cust-1",
      enrollmentId: "enroll-1",
      ownerMemberId: "member-1",
      model: "gpt-4.1-mini",
      promptVersion: "coaching_ai_v1",
      usage: {
        inputTokens: 1200,
        cachedInputTokens: 300,
        outputTokens: 400,
        imageCount: 0,
      },
      latencyMs: 850,
      inputFingerprint: fingerprintCoachingGenerationInput(snapshot),
    });

    expect(entry.feature).toBe("coaching");
    expect(entry.inputTokens).toBe(1200);
    expect(entry.estimatedCostUsd).toBeGreaterThan(0);
    expect(entry.pricingFound).toBe(true);
    expect(entry.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not record zero cost for unknown model pricing", () => {
    const entry = buildLlmCallLogEntry({
      feature: "coaching",
      pointKey: "daily_coach_generation",
      customerId: "cust-1",
      enrollmentId: "enroll-1",
      ownerMemberId: "member-1",
      model: "unknown-model",
      promptVersion: "coaching_ai_v1",
      usage: {
        inputTokens: 1200,
        cachedInputTokens: 0,
        outputTokens: 400,
      },
      latencyMs: 850,
    });

    expect(entry.estimatedCostUsd).toBeNull();
    expect(entry.pricingFound).toBe(false);
  });
});
