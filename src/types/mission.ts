import type { EntityId, ISODateString, Timestamp } from "./common";

/** Mission lifecycle status — computed, never user-edited. */
export type MissionStatus = "pending" | "in_progress" | "completed" | "expired";

/** Mission category key — labels and styling from mission rules config. */
export type MissionCategoryKey = string;

/** Mission difficulty key — labels from mission rules config. */
export type MissionDifficultyKey = string;

export interface MissionCategory {
  key: MissionCategoryKey;
  label: string;
  icon: string;
  color: string;
}

export interface MissionDifficulty {
  key: MissionDifficultyKey;
  label: string;
  priorityWeight: number;
}

export interface MissionReward {
  rewardKey: string;
  type: string;
  label: string;
  value: number;
  icon?: string;
}

export interface MissionProgress {
  missionId: string;
  current: number;
  target: number;
  remaining: number;
  progress: number;
  status: MissionStatus;
  updatedAt: Timestamp;
}

export interface Mission {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: MissionCategoryKey;
  priority: number;
  difficulty: MissionDifficultyKey;
  icon: string;
  color: string;
  current: number;
  target: number;
  remaining: number;
  progress: number;
  xp: number;
  rewards: MissionReward[];
  deadline: ISODateString | null;
  status: MissionStatus;
  /** Source engine identifier, e.g. next_step, achievement, business, adventure */
  sourceKey: string;
  sourceId: string;
}

export interface DailyMissionSet {
  memberId: EntityId;
  referenceDate: ISODateString;
  missions: Mission[];
  minCount: number;
  maxCount: number;
  computedAt: Timestamp;
}

export type AdventureStepStatus = "locked" | "in_progress" | "completed";

export interface AdventureStep {
  stepKey: string;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  current: number | null;
  target: number | null;
  remaining: number | null;
  progress: number | null;
  status: AdventureStepStatus;
  xp: number;
  isRuleMissing?: boolean;
}

/** Main storyline — newcomer growth path. */
export interface Adventure {
  adventureKey: string;
  title: string;
  description: string;
  steps: AdventureStep[];
  currentStepKey: string | null;
  overallProgress: number;
  completedStepCount: number;
  totalStepCount: number;
}

export interface MissionEngineResult {
  memberId: EntityId;
  referenceDate: ISODateString;
  dailyMissionSet: DailyMissionSet;
  allMissions: Mission[];
  adventure: Adventure;
  computedAt: Timestamp;
}
