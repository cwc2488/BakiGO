import type { ISODateString } from "./common";
import type { Mission } from "./mission";
import type { Priority, PriorityCategory } from "./president-ai";

export type GoalKpiCategory =
  | "vp"
  | "map"
  | "daily_measurement"
  | "daily_transaction"
  | "active"
  | "qualification";

export interface GoalKpiDefinition {
  key: GoalKpiCategory;
  label: string;
  priorityCategory: PriorityCategory;
}

export const GOAL_KPI_DEFINITIONS: GoalKpiDefinition[] = [
  { key: "vp", label: "VP", priorityCategory: "VP" },
  { key: "map", label: "MAP", priorityCategory: "MAP" },
  { key: "daily_measurement", label: "每日量測", priorityCategory: "ACTIVE" },
  { key: "daily_transaction", label: "每日成交", priorityCategory: "RETAIL" },
  { key: "active", label: "活躍", priorityCategory: "ACTIVE" },
  { key: "qualification", label: "晉升資格", priorityCategory: "QUALIFICATION" },
];

export interface GoalCard {
  id: string;
  kpiCategory: GoalKpiCategory;
  kpiLabel: string;
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  /** From engine output — UI must not derive from current/target. */
  progressPercent: number;
  unit: string;
  /** Presentation-layer projection — how much still needed today. */
  todayNeeded: number | null;
  /** Presentation-layer projection — estimated completion date at current pace. */
  estimatedCompletionDate: ISODateString | null;
  priority: number;
  rewardXP: number;
  isRuleMissing: boolean;
  sourceKey: string;
}

export interface GoalCenterResult {
  memberId: string;
  referenceDate: ISODateString;
  goals: GoalCard[];
  topPriorities: Priority[];
  dailyMissions: Mission[];
  nextSteps: GoalCard[];
  reasoning: string[];
  computedAt: string;
}
