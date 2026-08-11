import {
  CONSULTATION_PHASE1_MAX_STEP,
  CONSULTATION_TOTAL_STEPS,
  type ConsultationHealthData,
} from "@/types/consultation";

export function isValidConsultationStep(step: number): boolean {
  return Number.isInteger(step) && step >= 1 && step <= CONSULTATION_TOTAL_STEPS;
}

export function isPhase1Step(step: number): boolean {
  return step >= 1 && step <= CONSULTATION_PHASE1_MAX_STEP;
}

export function canAccessConsultationStep(currentStep: number, requestedStep: number): boolean {
  if (!isValidConsultationStep(requestedStep)) {
    return false;
  }
  return requestedStep <= Math.max(currentStep, 1);
}

export function getStepAfterCompletion(completedStep: number): number {
  if (completedStep >= CONSULTATION_TOTAL_STEPS) {
    return CONSULTATION_TOTAL_STEPS;
  }
  return completedStep + 1;
}

export function isPhase1Complete(currentStep: number): boolean {
  return currentStep > CONSULTATION_PHASE1_MAX_STEP;
}

export function createDefaultHealthData(): ConsultationHealthData {
  return {
    safetyReviewStatus: "pending_rules",
  };
}

export function normalizeHealthData(input: Partial<ConsultationHealthData>): ConsultationHealthData {
  return {
    safetyReviewStatus: "pending_rules",
    chronicConditions: trimOptional(input.chronicConditions),
    longTermMedications: trimOptional(input.longTermMedications),
    recentHealthChanges: trimOptional(input.recentHealthChanges),
    allergies: trimOptional(input.allergies),
    surgeriesOrInjuries: trimOptional(input.surgeriesOrInjuries),
    partnerNotes: trimOptional(input.partnerNotes),
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export const CONSULTATION_STEP_META: Record<
  number,
  { title: string; purpose: string }
> = {
  1: {
    title: "基本資料",
    purpose: "建立或確認這位客人的正式顧客檔案，後續量測與諮詢都會沿用同一份資料。",
  },
  2: {
    title: "健康關懷",
    purpose: "了解目前的健康背景與用藥狀況，方便後續安全地討論體態計畫。",
  },
  3: {
    title: "身體量測",
    purpose: "記錄 InBody 數據，作為這次諮詢的正式量測基準。",
  },
};
