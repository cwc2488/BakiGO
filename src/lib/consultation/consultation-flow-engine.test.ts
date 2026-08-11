import { describe, expect, it } from "vitest";
import {
  CONSULTATION_STEP_META,
  canAccessConsultationStep,
  canAccessStepNineOrLater,
  countMotivationReasons,
  createDefaultHealthData,
  getCommitmentTier,
  getStep8Mode,
  getStepAfterCompletion,
  isPhase1Complete,
  isPhase1Step,
  isPhase2Step,
  isValidConsultationStep,
  normalizeHealthData,
  normalizeMotivationsData,
  resolveStep8Outcome,
  validateCommitmentScore,
  validateStep6CanComplete,
  validateStep8Submission,
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

  it("blocks step 9+ when session is not_ready", () => {
    expect(canAccessConsultationStep(8, 8, "not_ready")).toBe(true);
    expect(canAccessConsultationStep(8, 9, "not_ready")).toBe(false);
    expect(canAccessStepNineOrLater({ currentStep: 8, status: "not_ready" })).toBe(false);
  });

  it("advances step after completion", () => {
    expect(getStepAfterCompletion(1)).toBe(2);
    expect(getStepAfterCompletion(3)).toBe(4);
    expect(getStepAfterCompletion(8)).toBe(9);
    expect(getStepAfterCompletion(14)).toBe(14);
  });

  it("detects phase boundaries", () => {
    expect(isPhase1Step(3)).toBe(true);
    expect(isPhase1Step(4)).toBe(false);
    expect(isPhase2Step(4)).toBe(true);
    expect(isPhase2Step(8)).toBe(true);
    expect(isPhase2Step(9)).toBe(false);
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

  it("requires at least one motivation reason for step 6", () => {
    expect(validateStep6CanComplete(normalizeMotivationsData({}))).toBe("請至少記錄一個改變理由。");
    expect(
      validateStep6CanComplete(normalizeMotivationsData({ reason1: "想更有精神" })),
    ).toBeNull();
    expect(countMotivationReasons(normalizeMotivationsData({ reason1: "a", reason3: "c" }))).toBe(2);
  });

  it("classifies commitment tiers", () => {
    expect(getCommitmentTier(10)).toBe("high");
    expect(getCommitmentTier(9)).toBe("medium");
    expect(getCommitmentTier(6)).toBe("medium");
    expect(getCommitmentTier(5)).toBe("low");
  });

  it("maps step 8 mode from commitment score", () => {
    expect(getStep8Mode(10)).toBe("execution_confirm");
    expect(getStep8Mode(7)).toBe("barrier_explore");
    expect(getStep8Mode(3)).toBe("not_ready_confirm");
  });

  it("routes step 4 through step 7 linearly via getStepAfterCompletion", () => {
    expect(getStepAfterCompletion(4)).toBe(5);
    expect(getStepAfterCompletion(5)).toBe(6);
    expect(getStepAfterCompletion(6)).toBe(7);
    expect(getStepAfterCompletion(7)).toBe(8);
  });

  it("routes commitment 10 to step 9 after step 8", () => {
    expect(resolveStep8Outcome({ commitmentScore: 10 })).toEqual({ type: "advance_to_step_9" });
  });

  it("routes commitment 6-9 based on readyIfBarrierSolved", () => {
    expect(resolveStep8Outcome({ commitmentScore: 8, readyIfBarrierSolved: true })).toEqual({
      type: "advance_to_step_9",
    });
    expect(resolveStep8Outcome({ commitmentScore: 8, readyIfBarrierSolved: false })).toEqual({
      type: "not_ready",
    });
    expect(() => resolveStep8Outcome({ commitmentScore: 6 })).toThrow(
      /readyIfBarrierSolved must be explicitly true or false/,
    );
  });

  it("rejects commitment 6-9 submission when readyIfBarrierSolved is undefined", () => {
    expect(
      validateStep8Submission({
        commitmentScore: 8,
        barriers: { barriers: ["time"] },
        readiness: {},
      }),
    ).toBe("請確認：若阻礙有辦法解決，客人是否願意認真開始。");

    expect(() => resolveStep8Outcome({ commitmentScore: 8 })).toThrow(
      /readyIfBarrierSolved must be explicitly true or false/,
    );
    expect(() => resolveStep8Outcome({ commitmentScore: 7, readyIfBarrierSolved: undefined })).toThrow();
  });

  it("routes commitment 1-5 to not_ready", () => {
    expect(resolveStep8Outcome({ commitmentScore: 5 })).toEqual({ type: "not_ready" });
    expect(resolveStep8Outcome({ commitmentScore: 1 })).toEqual({ type: "not_ready" });
  });

  it("validates step 8 submission by tier", () => {
    expect(
      validateStep8Submission({
        commitmentScore: 8,
        barriers: { barriers: ["time"] },
        readiness: {},
      }),
    ).toBe("請確認：若阻礙有辦法解決，客人是否願意認真開始。");

    expect(
      validateStep8Submission({
        commitmentScore: 8,
        barriers: { barriers: ["time"] },
        readiness: { readyIfBarrierSolved: false },
      }),
    ).toBeNull();

    expect(
      validateStep8Submission({
        commitmentScore: 3,
        barriers: {},
        readiness: {},
      }),
    ).toBe("請記錄目前尚未適合開始正式方案的原因。");

    expect(
      validateStep8Submission({
        commitmentScore: 10,
        barriers: {},
        readiness: {},
      }),
    ).toBeNull();
  });

  it("validates commitment score range", () => {
    expect(validateCommitmentScore(0)).not.toBeNull();
    expect(validateCommitmentScore(11)).not.toBeNull();
    expect(validateCommitmentScore(7)).toBeNull();
  });

  it("allows step 9 access only when ready", () => {
    expect(canAccessStepNineOrLater({ currentStep: 9, status: "in_progress" })).toBe(true);
    expect(canAccessStepNineOrLater({ currentStep: 8, status: "in_progress" })).toBe(false);
  });

  it("defines metadata for phase 1 and phase 2 steps", () => {
    expect(CONSULTATION_STEP_META[1]?.title).toBe("基本資料");
    expect(CONSULTATION_STEP_META[4]?.title).toBe("數據解說＋目標身材");
    expect(CONSULTATION_STEP_META[8]?.title).toBe("阻礙探索＋準備度確認");
  });
});
