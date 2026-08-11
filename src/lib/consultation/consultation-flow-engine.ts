import {
  CONSULTATION_BARRIER_KEYS,
  CONSULTATION_PHASE1_MAX_STEP,
  CONSULTATION_PHASE2_MAX_STEP,
  CONSULTATION_TOTAL_STEPS,
  type ConsultationBarriersData,
  type ConsultationBarrierKey,
  type ConsultationGoalsData,
  type ConsultationHealthData,
  type ConsultationMotivationsData,
  type ConsultationPreviousExperienceData,
  type ConsultationReadinessData,
  type ConsultationSession,
  type ConsultationStatus,
} from "@/types/consultation";

export function isValidConsultationStep(step: number): boolean {
  return Number.isInteger(step) && step >= 1 && step <= CONSULTATION_TOTAL_STEPS;
}

export function isPhase1Step(step: number): boolean {
  return step >= 1 && step <= CONSULTATION_PHASE1_MAX_STEP;
}

export function isPhase2Step(step: number): boolean {
  return step >= 4 && step <= CONSULTATION_PHASE2_MAX_STEP;
}

export function canAccessConsultationStep(
  currentStep: number,
  requestedStep: number,
  status: ConsultationStatus = "in_progress",
): boolean {
  if (!isValidConsultationStep(requestedStep)) {
    return false;
  }
  if (status === "not_ready") {
    return requestedStep <= Math.min(currentStep, CONSULTATION_PHASE2_MAX_STEP);
  }
  return requestedStep <= Math.max(currentStep, 1);
}

export function canAccessStepNineOrLater(session: Pick<ConsultationSession, "currentStep" | "status">): boolean {
  if (session.status === "not_ready") {
    return false;
  }
  return session.currentStep >= 9;
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

export function isPhase2Complete(currentStep: number, status: ConsultationStatus): boolean {
  return status !== "not_ready" && currentStep > CONSULTATION_PHASE2_MAX_STEP;
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

export function normalizeGoalsData(input: Partial<ConsultationGoalsData>): ConsultationGoalsData {
  return {
    goalType: input.goalType,
    targetWeightKg: parseOptionalNumber(input.targetWeightKg),
    targetBodyFatPercent: parseOptionalNumber(input.targetBodyFatPercent),
    desiredBodyDescription: trimOptional(input.desiredBodyDescription),
    goalNotes: trimOptional(input.goalNotes),
  };
}

export function normalizePreviousExperienceData(
  input: Partial<ConsultationPreviousExperienceData>,
): ConsultationPreviousExperienceData {
  const methods = (input.previousMethods ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    hasPreviousExperience: input.hasPreviousExperience,
    previousMethods: methods.length > 0 ? methods : undefined,
    previousResult: trimOptional(input.previousResult),
    regainedOrStopped: trimOptional(input.regainedOrStopped),
    whyStoppedOrRegained: trimOptional(input.whyStoppedOrRegained),
    experienceNotes: trimOptional(input.experienceNotes),
  };
}

export function normalizeMotivationsData(
  input: Partial<ConsultationMotivationsData>,
): ConsultationMotivationsData {
  return {
    reason1: trimOptional(input.reason1),
    reason2: trimOptional(input.reason2),
    reason3: trimOptional(input.reason3),
    motivationNotes: trimOptional(input.motivationNotes),
  };
}

export function countMotivationReasons(motivations: ConsultationMotivationsData): number {
  return [motivations.reason1, motivations.reason2, motivations.reason3].filter(Boolean).length;
}

export function validateStep6CanComplete(motivations: ConsultationMotivationsData): string | null {
  if (countMotivationReasons(motivations) < 1) {
    return "請至少記錄一個改變理由。";
  }
  return null;
}

export function validateCommitmentScore(score: number): string | null {
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return "決心評分必須是 1 到 10 的整數。";
  }
  return null;
}

export type CommitmentTier = "high" | "medium" | "low";

export function getCommitmentTier(score: number): CommitmentTier {
  if (score >= 10) {
    return "high";
  }
  if (score >= 6) {
    return "medium";
  }
  return "low";
}

export type Step8Mode = "execution_confirm" | "barrier_explore" | "not_ready_confirm";

export function getStep8Mode(commitmentScore: number): Step8Mode {
  const tier = getCommitmentTier(commitmentScore);
  if (tier === "high") {
    return "execution_confirm";
  }
  if (tier === "medium") {
    return "barrier_explore";
  }
  return "not_ready_confirm";
}

export type Step8Outcome =
  | { type: "advance_to_step_9" }
  | { type: "not_ready" };

export function resolveStep8Outcome(input: {
  commitmentScore: number;
  readyIfBarrierSolved?: boolean;
}): Step8Outcome {
  const tier = getCommitmentTier(input.commitmentScore);
  if (tier === "high") {
    return { type: "advance_to_step_9" };
  }
  if (tier === "medium") {
    if (input.readyIfBarrierSolved !== true && input.readyIfBarrierSolved !== false) {
      throw new Error(
        "readyIfBarrierSolved must be explicitly true or false for commitment scores 6–9.",
      );
    }
    if (input.readyIfBarrierSolved === true) {
      return { type: "advance_to_step_9" };
    }
    return { type: "not_ready" };
  }
  return { type: "not_ready" };
}

function normalizeBarrierList(values: unknown): ConsultationBarrierKey[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const allowed = new Set<string>(CONSULTATION_BARRIER_KEYS);
  return values.filter((value): value is ConsultationBarrierKey => {
    return typeof value === "string" && allowed.has(value);
  });
}

export function normalizeBarriersData(input: Partial<ConsultationBarriersData>): ConsultationBarriersData {
  const barriers = normalizeBarrierList(input.barriers);
  const potentialBarriers = normalizeBarrierList(input.potentialBarriers);
  const primaryBarrier =
    input.primaryBarrier && barriers.includes(input.primaryBarrier)
      ? input.primaryBarrier
      : barriers[0];

  return {
    barriers: barriers.length > 0 ? barriers : undefined,
    primaryBarrier,
    barrierNotes: trimOptional(input.barrierNotes),
    potentialBarriers: potentialBarriers.length > 0 ? potentialBarriers : undefined,
    potentialBarrierNotes: trimOptional(input.potentialBarrierNotes),
  };
}

export function normalizeReadinessData(input: Partial<ConsultationReadinessData>): ConsultationReadinessData {
  return {
    readyIfBarrierSolved:
      typeof input.readyIfBarrierSolved === "boolean" ? input.readyIfBarrierSolved : undefined,
    notReadyReason: trimOptional(input.notReadyReason),
    followUpNotes: trimOptional(input.followUpNotes),
    followUpDate: trimOptional(input.followUpDate),
    gateDecision: input.gateDecision,
    gateDecidedAt: trimOptional(input.gateDecidedAt),
  };
}

export function validateStep8Submission(input: {
  commitmentScore: number;
  barriers: ConsultationBarriersData;
  readiness: ConsultationReadinessData;
}): string | null {
  const tier = getCommitmentTier(input.commitmentScore);
  if (tier === "medium") {
    if (input.readiness.readyIfBarrierSolved !== true && input.readiness.readyIfBarrierSolved !== false) {
      return "請確認：若阻礙有辦法解決，客人是否願意認真開始。";
    }
  }
  if (tier === "low") {
    if (!input.readiness.notReadyReason?.trim()) {
      return "請記錄目前尚未適合開始正式方案的原因。";
    }
  }
  return null;
}

export function resolveActiveConsultationStep(
  session: Pick<ConsultationSession, "currentStep" | "status">,
  requestedStep: number,
): number {
  if (session.status === "not_ready") {
    return Math.min(session.currentStep, CONSULTATION_PHASE2_MAX_STEP);
  }
  if (!canAccessConsultationStep(session.currentStep, requestedStep, session.status)) {
    return session.currentStep;
  }
  return requestedStep;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  4: {
    title: "數據解說＋目標身材",
    purpose: "對照 Step 3 量測數據向客人解說，並記錄這次想達成的目標。",
  },
  5: {
    title: "過往改變身材經驗",
    purpose: "了解以前做過什麼、有沒有效、以及為什麼沒有持續。",
  },
  6: {
    title: "這次改變的三個理由",
    purpose: "記錄客人自己的話——這次若成功，對他來說最重要的理由是什麼。",
  },
  7: {
    title: "決心評分",
    purpose: "1 分代表還不想改，10 分代表現在非常想改變——請客人誠實評分。",
  },
  8: {
    title: "阻礙探索＋準備度確認",
    purpose: "依決心分數，確認真正卡關的地方，或確認是否準備好進入下一步。",
  },
};

export const CONSULTATION_BARRIER_LABELS: Record<ConsultationBarrierKey, string> = {
  time: "時間",
  diet: "飲食",
  work_schedule: "工作／作息",
  family: "家庭",
  budget: "預算",
  exercise: "運動",
  dont_know_how: "不知道怎麼做",
  fear_of_failure: "害怕失敗",
  past_failure: "過去失敗經驗",
  lack_of_support: "缺乏支持",
  other: "其他",
};

export const CONSULTATION_GOAL_TYPE_LABELS: Record<
  import("@/types/consultation").ConsultationGoalType,
  string
> = {
  fat_loss: "減脂",
  muscle_gain: "增肌",
  body_recomposition: "體態重組",
  health: "健康改善",
  other: "其他",
};
