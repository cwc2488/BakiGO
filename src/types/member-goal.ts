import type { EntityId, ISODateString, YearMonth } from "./common";

export type MemberGoalType = "monthly_vp" | "monthly_income_ntd" | "monthly_new_customers";

export type MemberGoalHorizon = "short" | "medium" | "long";

export interface MemberGoal {
  id: string;
  ownerMemberId: EntityId;
  type: MemberGoalType;
  targetValue: number;
  horizon: MemberGoalHorizon;
  yearMonth: YearMonth;
  label?: string;
  createdAt: string;
  isActive: boolean;
}

export interface MemberGoalCreateInput {
  ownerMemberId: EntityId;
  type: MemberGoalType;
  targetValue: number;
  horizon: MemberGoalHorizon;
  yearMonth: YearMonth;
  label?: string;
}

export interface MemberGoalProgressView {
  goalId: string;
  type: MemberGoalType;
  horizon: MemberGoalHorizon;
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
  unit: string;
  todayNeeded: number | null;
  isComplete: boolean;
  yearMonth: YearMonth;
}

export interface CareerBlueprintView {
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
  sourceKey: string;
  nextRankName: string | null;
  ultimateRankName: string;
}

export interface GoalBlueprintResult {
  referenceDate: ISODateString;
  ultimateGoal: { title: string; description: string };
  careerGoal: CareerBlueprintView | null;
  memberGoals: MemberGoalProgressView[];
}

export const MEMBER_GOAL_TYPE_LABELS: Record<MemberGoalType, string> = {
  monthly_vp: "本月 VP",
  monthly_income_ntd: "本月收入",
  monthly_new_customers: "本月新客人",
};

export const MEMBER_GOAL_HORIZON_LABELS: Record<MemberGoalHorizon, string> = {
  short: "短期",
  medium: "中期",
  long: "長期",
};

export const MEMBER_GOAL_TYPE_UNITS: Record<MemberGoalType, string> = {
  monthly_vp: "VP",
  monthly_income_ntd: "元",
  monthly_new_customers: "位",
};
