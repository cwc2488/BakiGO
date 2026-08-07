export type {
  FocusMode,
  FocusModeKey,
  Opportunity,
  PresidentAIResult,
  Priority,
  PriorityCategory,
  Warning,
} from "@/types/president-ai";

export interface PresidentAIInput {
  memberId: string;
  referenceDate: string;
  nextSteps: Array<{
    stepKey: string;
    title: string;
    description: string;
    current: number;
    target: number;
    remaining: number;
    progressPercent: number;
    priority: number;
  }>;
  qualificationResults: Array<{
    ruleKey: string;
    targetRankName: string;
    isQualified: boolean;
    isRuleMissing: boolean;
    overallProgressPercent: number | null;
    gaps: Array<{
      gapKey: string;
      label: string;
      current: number;
      target: number;
      remaining: number;
      progressPercent: number;
      metric: string;
    }>;
  }>;
  promotionProgress: {
    currentRankName: string;
    nextRankName: string | null;
    downlineRankName: string | null;
    current: number;
    target: number | null;
    remaining: number | null;
    progressPercent: number | null;
    isRuleMissing: boolean;
    isMaxRank: boolean;
    progressSource: string;
    description: string;
    ruleKey: string | null;
  };
  map: {
    activeLines: number;
    totalLines: number | null;
    progressPercent: number | null;
  };
  monthlyChallenge: {
    title: string;
    overallProgressPercent: number;
    criteria: Array<{
      criterionKey: string;
      label: string;
      currentValue: number;
      targetValue: number;
      progressPercent: number;
      unit?: string;
    }>;
  };
  retailHouse: {
    houses: Array<{
      retailHouseKey: string;
      transactionCount: number;
      totalAmount: number;
    }>;
  };
  missions: {
    dailyMissionSet: {
      missions: Array<{
        id: string;
        title: string;
        description: string;
        current: number;
        target: number;
        remaining: number;
        progress: number;
        priority: number;
        sourceKey: string;
      }>;
    };
  };
  gamification: {
    streak: {
      currentStreak: number;
      isActiveToday: boolean;
    };
  };
  ruleMissing: {
    entries: Array<{ ruleKey: string; engine: string }>;
  };
  memberGoals: Array<{
    goalId: string;
    type: string;
    horizon: "short" | "medium" | "long";
    title: string;
    description: string;
    current: number;
    target: number;
    remaining: number;
    progressPercent: number;
    todayNeeded: number | null;
    unit: string;
    actionSteps: Array<{ label: string; detail: string; href?: string }>;
  }>;
  careerGoal: {
    title: string;
    description: string;
    current: number;
    target: number;
    remaining: number;
    progressPercent: number;
    sourceKey: string;
    actionSteps: Array<{ label: string; detail: string; href?: string }>;
  } | null;
}

export interface PriorityCandidate {
  sourceKey: string;
  title: string;
  description: string;
  category: import("@/types/president-ai").PriorityCategory;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number | null;
  enginePriority: number;
  actionHref?: string;
}
