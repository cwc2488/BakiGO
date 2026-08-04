import type { PromotionProgress } from "../calculate-promotion-progress";
import type { QualificationResult } from "../qualification/types";

export interface NextStep {
  stepKey: string;
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  /** Computed by the engine — UI must not derive progress from current/target. */
  progressPercent: number;
  priority: number;
  rewardXP: number;
}

export interface CalculateNextStepsInput {
  referenceDate: string;
  activities: Array<{
    memberId: string;
    activityKey: string;
    activityDate: string;
  }>;
  vp: {
    totalVp: number;
  };
  map: {
    activeLines: number;
  };
  monthlyChallenge: {
    criteria: Array<{
      criterionKey: string;
      label: string;
      currentValue: number;
      targetValue: number | null;
      unit?: string;
    }>;
  };
  promotionProgress?: PromotionProgress;
  qualificationResults?: QualificationResult[];
}

export interface NextStepEngineResult {
  nextSteps: NextStep[];
  computedAt: Date;
}
