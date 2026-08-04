/**
 * Promotion Rules — 賀寶芙晉升制度
 *
 * Source of truth: docs/BUSINESS_RULES.md → Promotion Rules
 * All promotion KPIs live here. UI / Mission / Achievement / Adventure read only.
 */

/** Promotion ladder rank identifiers. */
export const PROMOTION_RANK_IDS = {
  MEMBER: "member",
  SUPERVISOR: "supervisor",
  WORLD_TEAM: "world_team",
  PROMOTION_GROUP: "promotion_group",
  WEALTH_GROUP: "wealth_group",
  PRESIDENT: "president",
} as const;

export type PromotionRankId =
  (typeof PROMOTION_RANK_IDS)[keyof typeof PROMOTION_RANK_IDS];

/** Maps persisted member.rankKey values to promotion rankId. */
export const MEMBER_RANK_TO_PROMOTION_RANK: Record<string, PromotionRankId> = {
  new_member: PROMOTION_RANK_IDS.MEMBER,
  member: PROMOTION_RANK_IDS.MEMBER,
  supervisor: PROMOTION_RANK_IDS.SUPERVISOR,
  world_team: PROMOTION_RANK_IDS.WORLD_TEAM,
  promotion_group: PROMOTION_RANK_IDS.PROMOTION_GROUP,
  wealth_group: PROMOTION_RANK_IDS.WEALTH_GROUP,
  president: PROMOTION_RANK_IDS.PRESIDENT,
};

export interface PromotionRequirement {
  /** Downline members at this rank count toward promotion. */
  downlineRankId: PromotionRankId;
  /** Required count — null until defined (Priority 0). */
  requiredCount: number | null;
  descriptionTemplate: string;
}

/**
 * One rank node in the promotion ladder.
 * `requirement` describes what is needed to advance from this rank to `nextRank`.
 */
export interface PromotionRank {
  rankId: PromotionRankId;
  name: string;
  parentRank: PromotionRankId | null;
  nextRank: PromotionRankId | null;
  requirement: PromotionRequirement | null;
  description: string;
  badge: string;
  themeColor: string;
}

/** Explicit promotion transition rule (from → to). */
export interface PromotionRule {
  ruleKey: string;
  fromRankId: PromotionRankId;
  toRankId: PromotionRankId;
  requirement: PromotionRequirement;
  description: string;
  badge: string;
  themeColor: string;
}

export interface PromotionAchievementTemplates {
  firstDownline: {
    achievementKeyTemplate: string;
    titleTemplate: string;
    descriptionTemplate: string;
    rewardXP: number | null;
    badgeKeyTemplate: string;
  };
  downlineLine: {
    achievementKeyTemplate: string;
    titleTemplate: string;
    descriptionTemplate: string;
    rewardXP: number | null;
    badgeKeyTemplate: string;
  };
  rankReached: {
    achievementKeyTemplate: string;
    titleTemplate: string;
    descriptionTemplate: string;
    rewardXP: number | null;
    badgeKeyTemplate: string;
  };
}

export interface PromotionNextStepTemplates {
  titleTemplate: string;
  descriptionTemplate: string;
  dailyHintTemplate: string;
  priority: number;
  rewardXP: number | null;
}

export interface PromotionMissionTemplates {
  titleTemplate: string;
  subtitleTemplate: string;
  priority: number;
}

export interface PromotionAdventureTemplates {
  adventureKey: string;
  title: string;
  description: string;
  stepTitleTemplate: string;
  stepSubtitleTemplate: string;
  stepDescriptionTemplate: string;
  xp: number | null;
}

export interface PromotionAchievementMilestone {
  milestoneKey: string;
  rankId: PromotionRankId;
  type: "downline_count" | "rank_reached";
  /** Null when resolved from promotion rule via usePromotionRuleCount. */
  requiredCount: number | null;
  usePromotionRuleCount?: boolean;
}

export interface PromotionTree {
  order: PromotionRankId[];
  ranks: Record<PromotionRankId, PromotionRank>;
  rules: PromotionRule[];
  achievementMilestones: PromotionAchievementMilestone[];
  achievementTemplates: PromotionAchievementTemplates;
  nextStepTemplates: PromotionNextStepTemplates;
  missionTemplates: PromotionMissionTemplates;
  adventureTemplates: PromotionAdventureTemplates;
}

export const DEFAULT_PROMOTION_TREE: PromotionTree = {
  order: [
    PROMOTION_RANK_IDS.MEMBER,
    PROMOTION_RANK_IDS.SUPERVISOR,
    PROMOTION_RANK_IDS.WORLD_TEAM,
    PROMOTION_RANK_IDS.PROMOTION_GROUP,
    PROMOTION_RANK_IDS.WEALTH_GROUP,
    PROMOTION_RANK_IDS.PRESIDENT,
  ],
  ranks: {
    [PROMOTION_RANK_IDS.MEMBER]: {
      rankId: PROMOTION_RANK_IDS.MEMBER,
      name: "會員",
      parentRank: null,
      nextRank: PROMOTION_RANK_IDS.SUPERVISOR,
      requirement: null,
      description: "組織的起點。",
      badge: "badge_member",
      themeColor: "#86868b",
    },
    [PROMOTION_RANK_IDS.SUPERVISOR]: {
      rankId: PROMOTION_RANK_IDS.SUPERVISOR,
      name: "督導",
      parentRank: PROMOTION_RANK_IDS.MEMBER,
      nextRank: PROMOTION_RANK_IDS.WORLD_TEAM,
      requirement: null,
      description: "領導團隊的第一步。",
      badge: "badge_supervisor",
      themeColor: "#0071e3",
    },
    [PROMOTION_RANK_IDS.WORLD_TEAM]: {
      rankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      name: "世界組",
      parentRank: PROMOTION_RANK_IDS.SUPERVISOR,
      nextRank: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.WORLD_TEAM,
        requiredCount: 5,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "組織開始出現世界組成員。",
      badge: "badge_world_team",
      themeColor: "#30d158",
    },
    [PROMOTION_RANK_IDS.PROMOTION_GROUP]: {
      rankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      name: "推廣組",
      parentRank: PROMOTION_RANK_IDS.WORLD_TEAM,
      nextRank: PROMOTION_RANK_IDS.WEALTH_GROUP,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
        requiredCount: 6,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "推廣力量在組織中成形。",
      badge: "badge_promotion_group",
      themeColor: "#ff9f0a",
    },
    [PROMOTION_RANK_IDS.WEALTH_GROUP]: {
      rankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
      name: "富豪組",
      parentRank: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      nextRank: PROMOTION_RANK_IDS.PRESIDENT,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
        requiredCount: 3,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "事業達到新高度。",
      badge: "badge_wealth_group",
      themeColor: "#ffd60a",
    },
    [PROMOTION_RANK_IDS.PRESIDENT]: {
      rankId: PROMOTION_RANK_IDS.PRESIDENT,
      name: "總裁",
      parentRank: PROMOTION_RANK_IDS.WEALTH_GROUP,
      nextRank: null,
      requirement: null,
      description: "晉升制度的最高階。",
      badge: "badge_president",
      themeColor: "#1d1d1f",
    },
  },
  rules: [
    {
      ruleKey: "promotion_world_team_to_promotion_group",
      fromRankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      toRankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.WORLD_TEAM,
        requiredCount: 5,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "世界組晉升推廣組。",
      badge: "badge_promotion_group",
      themeColor: "#ff9f0a",
    },
    {
      ruleKey: "promotion_promotion_group_to_wealth_group",
      fromRankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      toRankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
        requiredCount: 6,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "推廣組晉升富豪組。",
      badge: "badge_wealth_group",
      themeColor: "#ffd60a",
    },
    {
      ruleKey: "promotion_wealth_group_to_president",
      fromRankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
      toRankId: PROMOTION_RANK_IDS.PRESIDENT,
      requirement: {
        downlineRankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
        requiredCount: 3,
        descriptionTemplate: "需要 {requiredCount} 個{downlineRankName}即可升{nextRankName}",
      },
      description: "富豪組晉升總裁。",
      badge: "badge_president",
      themeColor: "#1d1d1f",
    },
  ],
  achievementMilestones: [
    {
      milestoneKey: "first_world_team",
      rankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      type: "downline_count",
      requiredCount: 1,
    },
    {
      milestoneKey: "line_1_world_team",
      rankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      type: "downline_count",
      requiredCount: 1,
    },
    {
      milestoneKey: "line_5_world_team",
      rankId: PROMOTION_RANK_IDS.WORLD_TEAM,
      type: "downline_count",
      requiredCount: null,
      usePromotionRuleCount: true,
    },
    {
      milestoneKey: "rank_promotion_group",
      rankId: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      type: "rank_reached",
      requiredCount: 1,
    },
    {
      milestoneKey: "rank_wealth_group",
      rankId: PROMOTION_RANK_IDS.WEALTH_GROUP,
      type: "rank_reached",
      requiredCount: 1,
    },
    {
      milestoneKey: "rank_president",
      rankId: PROMOTION_RANK_IDS.PRESIDENT,
      type: "rank_reached",
      requiredCount: 1,
    },
  ],
  achievementTemplates: {
    firstDownline: {
      achievementKeyTemplate: "promotion_first_{rankId}",
      titleTemplate: "第一次{rankName}",
      descriptionTemplate: "組織中出現第 {threshold} 位{rankName}",
      rewardXP: null,
      badgeKeyTemplate: "badge_promotion_first_{rankId}",
    },
    downlineLine: {
      achievementKeyTemplate: "promotion_line_{rankId}_{threshold}",
      titleTemplate: "第 {threshold} 條{rankName}",
      descriptionTemplate: "組織中出現第 {threshold} 位{rankName}",
      rewardXP: null,
      badgeKeyTemplate: "badge_promotion_line_{rankId}_{threshold}",
    },
    rankReached: {
      achievementKeyTemplate: "promotion_rank_{rankId}",
      titleTemplate: "{rankName}",
      descriptionTemplate: "晉升為 {rankName}",
      rewardXP: null,
      badgeKeyTemplate: "badge_promotion_rank_{rankId}",
    },
  },
  nextStepTemplates: {
    titleTemplate: "距離{nextRankName}還差{remaining}位{downlineRankName}",
    descriptionTemplate:
      "目前已有 {current} 位{downlineRankName}，目標 {target} 位，完成率 {progressPercent}%",
    dailyHintTemplate:
      "今天再培養 {remaining} 位{downlineRankName}即可完成 {progressPercent}%",
    priority: 0,
    rewardXP: null,
  },
  missionTemplates: {
    titleTemplate: "距離{nextRankName}還差{remaining}位{downlineRankName}",
    subtitleTemplate: "晉升進度 {progressPercent}%",
    priority: 1,
  },
  adventureTemplates: {
    adventureKey: "promotion_main",
    title: "晉升主線",
    description: "沿著晉升制度前進，從會員到總裁。",
    stepTitleTemplate: "{rankName}",
    stepSubtitleTemplate: "晉升之路",
    stepDescriptionTemplate: "{description}",
    xp: null,
  },
};

export function resolvePromotionRankId(memberRankKey: string): PromotionRankId | null {
  return MEMBER_RANK_TO_PROMOTION_RANK[memberRankKey] ?? null;
}

export function getPromotionRank(
  tree: PromotionTree,
  rankId: PromotionRankId,
): PromotionRank {
  return tree.ranks[rankId];
}
