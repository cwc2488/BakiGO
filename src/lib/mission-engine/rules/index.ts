/**
 * Mission Engine rules — all mission and adventure definitions.
 * UI must never hardcode business logic; read MissionEngineResult only.
 */

export const MISSION_SOURCE_KEYS = {
  NEXT_STEP: "next_step",
  ACHIEVEMENT: "achievement",
  BUSINESS: "business",
  ADVENTURE: "adventure",
} as const;

export const MISSION_CATEGORY_KEYS = {
  DAILY: "daily",
  CHALLENGE: "challenge",
  CAREER: "career",
  GROWTH: "growth",
  STREAK: "streak",
} as const;

export const MISSION_DIFFICULTY_KEYS = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
} as const;

export const MISSION_STATUS_KEYS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export const ADVENTURE_STEP_KEYS = {
  FIRST_MEASUREMENT: "first_measurement",
  FIRST_TRANSACTION: "first_transaction",
  FIRST_MEMBER: "first_member",
  FIRST_SUPERVISOR: "first_supervisor",
  FIRST_ACTIVE_SUPERVISOR: "first_active_supervisor",
  FIRST_WORLD_TEAM: "first_world_team",
  FIRST_PROMOTION_GROUP: "first_promotion_group",
  FIRST_WEALTH_GROUP: "first_wealth_group",
  FIRST_PRESIDENT: "first_president",
} as const;

export interface MissionCategoryRule {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export interface MissionDifficultyRule {
  key: string;
  label: string;
  priorityWeight: number;
  /** Missions with remaining/target ratio above this map to this difficulty. */
  remainingRatioMin: number;
}

export interface MissionTemplateRule {
  subtitleTemplate: string;
  descriptionTemplate: string;
}

export interface NextStepMissionMappingRule {
  stepKeyPattern: string;
  categoryKey: string;
  icon: string;
  color: string;
  subtitleTemplate: string;
}

export interface AdventureStepRule {
  stepKey: string;
  order: number;
  title: string;
  subtitle: string;
  descriptionTemplate: string;
  icon: string;
  color: string;
  eventSource: string;
  triggerType: string;
  eventKey?: string;
  /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
  threshold: number | null;
  xp: number;
  /** For downline rank milestones — count downline members at rank. */
  downlineRankKey?: string;
}

export interface MissionRulesConfig {
  dailyMissionSet: {
    minCount: number;
    maxCount: number;
  };
  categories: MissionCategoryRule[];
  difficulties: MissionDifficultyRule[];
  defaultTemplate: MissionTemplateRule;
  nextStepMappings: NextStepMissionMappingRule[];
  defaultNextStepMapping: {
    categoryKey: string;
    icon: string;
    color: string;
    subtitleTemplate: string;
  };
  achievementNearUnlockRatio: number;
  adventure: {
    adventureKey: string;
    title: string;
    description: string;
    steps: AdventureStepRule[];
  };
  rewardLabels: {
    xp: string;
    badge: string;
  };
  streakMaintain: {
    titleTemplate: string;
    subtitleTemplate: string;
    /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
    dailyTarget: number | null;
    xp: number;
    priority: number;
  };
  monthlyChallengeMission: {
    subtitleTemplate: string;
    /** Null until defined in docs/BUSINESS_RULES.md — never infer a default. */
    overallTarget: number | null;
    xp: number;
    priority: number;
  };
}

export const DEFAULT_MISSION_RULES: MissionRulesConfig = {
  dailyMissionSet: {
    minCount: 3,
    maxCount: 5,
  },
  categories: [
    {
      key: MISSION_CATEGORY_KEYS.DAILY,
      label: "今日",
      icon: "calendar",
      color: "#77b539",
    },
    {
      key: MISSION_CATEGORY_KEYS.CHALLENGE,
      label: "挑戰",
      icon: "flame",
      color: "#ff375f",
    },
    {
      key: MISSION_CATEGORY_KEYS.CAREER,
      label: "事業",
      icon: "map",
      color: "#30d158",
    },
    {
      key: MISSION_CATEGORY_KEYS.GROWTH,
      label: "成長",
      icon: "star",
      color: "#bf5af2",
    },
    {
      key: MISSION_CATEGORY_KEYS.STREAK,
      label: "連續",
      icon: "bolt",
      color: "#ff9f0a",
    },
  ],
  difficulties: [
    {
      key: MISSION_DIFFICULTY_KEYS.EASY,
      label: "簡單",
      priorityWeight: 1,
      remainingRatioMin: 0,
    },
    {
      key: MISSION_DIFFICULTY_KEYS.MEDIUM,
      label: "中等",
      priorityWeight: 2,
      remainingRatioMin: 0.35,
    },
    {
      key: MISSION_DIFFICULTY_KEYS.HARD,
      label: "困難",
      priorityWeight: 3,
      remainingRatioMin: 0.65,
    },
  ],
  defaultTemplate: {
    subtitleTemplate: "距離目標還差 {remaining}",
    descriptionTemplate: "目前 {current} / {target}，完成後獲得 {xp} 積分",
  },
  nextStepMappings: [
    {
      stepKeyPattern: "daily_",
      categoryKey: MISSION_CATEGORY_KEYS.DAILY,
      icon: "calendar",
      color: "#77b539",
      subtitleTemplate: "今日優先事項",
    },
    {
      stepKeyPattern: "world_team",
      categoryKey: MISSION_CATEGORY_KEYS.CAREER,
      icon: "globe",
      color: "#30d158",
      subtitleTemplate: "事業晉升路徑",
    },
    {
      stepKeyPattern: "map_",
      categoryKey: MISSION_CATEGORY_KEYS.CAREER,
      icon: "tree",
      color: "#30d158",
      subtitleTemplate: "組織版圖擴張",
    },
    {
      stepKeyPattern: "monthly_",
      categoryKey: MISSION_CATEGORY_KEYS.CHALLENGE,
      icon: "flame",
      color: "#ff375f",
      subtitleTemplate: "本月挑戰進度",
    },
  ],
  defaultNextStepMapping: {
    categoryKey: MISSION_CATEGORY_KEYS.GROWTH,
    icon: "target",
    color: "#77b539",
    subtitleTemplate: "繼續前進",
  },
  achievementNearUnlockRatio: 0.75,
  adventure: {
    adventureKey: "promotion_main",
    title: "晉升主線",
    description: "由晉升規則驅動的主線成長路徑。",
    steps: [],
  },
  rewardLabels: {
    xp: "積分",
    badge: "徽章",
  },
  streakMaintain: {
    titleTemplate: "延續 {current} 天連續紀錄",
    subtitleTemplate: "今日保持活躍",
    dailyTarget: null,
    xp: 15,
    priority: 2,
  },
  monthlyChallengeMission: {
    subtitleTemplate: "整體進度 {current}%",
    overallTarget: null,
    xp: 25,
    priority: 3,
  },
};
