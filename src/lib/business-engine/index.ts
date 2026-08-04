export { calculateMonthlyProgress, calculateMonthlyProgressPercent } from "./calculate-monthly-progress";
export { calculateRetailHouse } from "./calculate-retail-house";
export { calculateMapProgress } from "./calculate-map-progress";
export {
  calculateRankProgress,
  calculateSupervisorProgress,
  calculateWorldTeamProgress,
} from "./calculate-rank-progress";
export { calculateLeaderboard } from "./calculate-leaderboard";
export { calculateLeaderForest } from "./calculate-leader-forest";
export { calculateVp } from "./calculate-vp";
export {
  calculateVP,
  calculateMonthlyVP,
  calculateRollingVP,
  calculateOrganizationVP,
  calculateQualificationVP,
  calculateLifetimeVP,
  calculateRetailHouseVP,
  buildVpMonthlyHistory,
  toLegacyVpResult,
} from "./vp";
export type {
  CalculateVPInput,
  VpEngineResult,
  VpEngineTransactionInput,
} from "./vp";
export {
  calculatePromotionProgress,
  type CalculatePromotionProgressInput,
  type PromotionOrganization,
  type PromotionOrganizationMember,
  type PromotionProgress,
  type PromotionProgressSource,
} from "./calculate-promotion-progress";
export {
  evaluateQualification,
  evaluateQualifications,
  evaluateAllQualificationRules,
  evaluateQualificationForRank,
  buildQualificationContext,
  buildQualificationNextSteps,
  QualificationEvaluator,
  type QualificationResult,
  type QualificationGap,
  type QualificationEvaluationContext,
} from "./qualification";
export {
  calculateAchievementEngine,
  calculateAchievements,
  calculateBadges,
  calculateStreak,
  calculateXp,
  collectGamificationEvents,
  type CalculateAchievementEngineInput,
} from "./achievement";
export {
  calculateNextSteps,
  type NextStep,
  type CalculateNextStepsInput,
  type NextStepEngineResult,
} from "./next-step";

export {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_GAMIFICATION_RULES,
  DEFAULT_PROMOTION_TREE,
  GAMIFICATION_EVENT_SOURCES,
  PROMOTION_RANK_IDS,
  RANK_KEYS,
  ACTIVITY_KEYS,
  LEADERBOARD_METRICS,
  RETAIL_TRANSACTION_TYPE_KEYS,
} from "./rules";
export type { BusinessRulesConfig, GamificationRulesConfig, AchievementRule, BadgeRule } from "./rules";

export type {
  Achievement,
  AchievementEngineResult,
  Badge,
  GamificationEvent,
  Streak,
  Xp,
} from "@/types/gamification";

export type {
  ActivityEvent,
  CalculateMonthlyProgressInput,
  CalculateRetailHouseInput,
  CalculateMapProgressInput,
  CalculateRankProgressInput,
  CalculateLeaderboardInput,
  CalculateLeaderForestInput,
  RetailHouseResult,
  MapProgressResult,
  MapLineStatus,
  RankProgressResult,
  RankCriterionProgress,
  LeaderboardResult,
  LeaderboardEntry,
  LeaderForestResult,
  LeaderForestLine,
  LeaderForestMemberStatus,
  LeaderSignal,
  CalculateVpInput,
  VpResult,
  VpTypeTotal,
} from "./types";

export {
  clampPercent,
  countActivitiesByKey,
  criterionProgress,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
  getDirectDownline,
  collectDownlineIds,
} from "./utils";
