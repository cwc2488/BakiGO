import { describe, expect, it } from "vitest";
import {
  CONSULTATION_STEP_META,
  canAccessConsultationStep,
  createDefaultHealthData,
  getStepAfterCompletion,
  isPhase1Complete,
  isPhase1Step,
  isValidConsultationStep,
  normalizeHealthData,
} from "./consultation-flow-engine";

describe("consultation-flow-engine", () => {
  it("validates step numbers", () => {
    expect(isValidConsultationStep(1)).toBe(true);
    expect(isValidConsultationStep(14)).toBe(true);
    expect(isValidConsultationStep(0)).toBe(false);
    expect(isValidConsultationStep(15)).toBe(false);
  });

  it("allows access up to current step", () => {
    expect(canAccessConsultationStep(1, 1)).toBe(true);
    expect(canAccessConsultationStep(2, 1)).toBe(true);
    expect(canAccessConsultationStep(2, 3)).toBe(false);
  });

  it("advances step after completion", () => {
    expect(getStepAfterCompletion(1)).toBe(2);
    expect(getStepAfterCompletion(3)).toBe(4);
    expect(getStepAfterCompletion(14)).toBe(14);
  });

  it("detects phase 1 completion", () => {
    expect(isPhase1Step(3)).toBe(true);
    expect(isPhase1Step(4)).toBe(false);
    expect(isPhase1Complete(3)).toBe(false);
    expect(isPhase1Complete(4)).toBe(true);
  });

  it("creates default health data with pending safety review", () => {
    expect(createDefaultHealthData()).toEqual({ safetyReviewStatus: "pending_rules" });
  });

  it("normalizes health data without auto safety classification", () => {
    const health = normalizeHealthData({
      chronicConditions: "  高血壓  ",
      longTermMedications: "降血壓藥",
    });
    expect(health.safetyReviewStatus).toBe("pending_rules");
    expect(health.chronicConditions).toBe("高血壓");
    expect(health.longTermMedications).toBe("降血壓藥");
  });

  it("defines metadata for phase 1 steps", () => {
    expect(CONSULTATION_STEP_META[1]?.title).toBe("基本資料");
    expect(CONSULTATION_STEP_META[2]?.title).toBe("健康關懷");
    expect(CONSULTATION_STEP_META[3]?.title).toBe("身體量測");
  });
});
