import type { AchievementEngineResult } from "@/types/gamification";
import type { MissionEngineResult } from "@/types/mission";
import type { MonthlyChallengeProgress } from "@/types/monthly-challenge";
import type { NextStep } from "@/lib/business-engine/next-step/types";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import type { GamificationEvent } from "@/types/gamification";
import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { collectGamificationEvents } from "@/lib/business-engine/achievement";
import {
  DEFAULT_MISSION_RULES,
  MISSION_SOURCE_KEYS,
  type MissionRulesConfig,
} from "./rules";
import {
  calculateAdventure,
  adventureStepToMission,
  type CalculateAdventureInput,
} from "./calculate-adventure";
import { generateMissionsFromNextSteps } from "./generators/from-next-steps";
import {
  generateMissionsFromAchievements,
  generateMissionsFromBusiness,
  generateMissionsFromPromotion,
  generateMissionsFromQualification,
} from "./generators/from-engines";
import { scoreMissionPriority } from "./utils";
import type { Mission } from "@/types/mission";

export interface CalculateMissionEngineInput {
  memberId: string;
  referenceDate: string;
  nextSteps: NextStep[];
  monthlyChallenge: MonthlyChallengeProgress;
  gamification: AchievementEngineResult;
  promotionProgress: PromotionProgress;
  qualificationResults: QualificationResult[];
  activities: Array<{
    id?: string;
    memberId: string;
    activityKey: string;
    activityDate: string;
    value?: number;
  }>;
  transactions: Array<{
    transactionDate: string;
    transactionTypeKey: string;
    amount: number;
  }>;
  vpTotal: number;
  mapActiveLines: number;
  currentRankKey: string;
  qualifiedRankKeys: string[];
  downlineRankCounts: Record<string, number>;
  promotionQualifiedRankIds: string[];
}

function dedupeMissions(missions: Mission[]): Mission[] {
  const seen = new Set<string>();
  return missions.filter((mission) => {
    if (seen.has(mission.id)) {
      return false;
    }
    seen.add(mission.id);
    return mission.status !== "completed";
  });
}

function selectDailyMissions(
  candidates: Mission[],
  rules: MissionRulesConfig,
): Mission[] {
  const scored = candidates
    .map((mission) => ({
      mission,
      score: scoreMissionPriority(
        mission.priority,
        mission.difficulty,
        rules.difficulties,
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.mission.remaining - right.mission.remaining;
    });

  const maxCount = rules.dailyMissionSet.maxCount;
  const minCount = rules.dailyMissionSet.minCount;
  const selected = scored.slice(0, maxCount).map((item) => item.mission);

  if (selected.length >= minCount) {
    return selected;
  }

  return scored.slice(0, minCount).map((item) => item.mission);
}

function buildAdventureInput(
  input: CalculateMissionEngineInput,
  events: GamificationEvent[],
): CalculateAdventureInput {
  return {
    referenceDate: input.referenceDate,
    events,
    vpTotal: input.vpTotal,
    mapActiveLines: input.mapActiveLines,
    monthlyChallengePercent: input.monthlyChallenge.overallProgressPercent,
    currentStreak: input.gamification.streak.currentStreak,
    currentRankKey: input.currentRankKey,
    qualifiedRankKeys: input.qualifiedRankKeys,
    downlineRankCounts: input.downlineRankCounts,
    promotionQualifiedRankIds: input.promotionQualifiedRankIds,
    qualificationResults: input.qualificationResults,
  };
}

/**
 * Mission Engine — decision layer above Business / Next Step / Achievement engines.
 * Outputs today's top 3–5 missions plus the main Adventure storyline.
 */
export function calculateMissionEngine(
  input: CalculateMissionEngineInput,
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): MissionEngineResult {
  const events = collectGamificationEvents({
    memberId: input.memberId,
    activities: input.activities.map((activity, index) => ({
      id: activity.id ?? `activity-${index}`,
      memberId: activity.memberId,
      activityKey: activity.activityKey,
      activityDate: activity.activityDate,
      value: activity.value,
    })),
    transactions: input.transactions,
  });

  const adventure = calculateAdventure(
    buildAdventureInput(input, events),
    rules,
    DEFAULT_BUSINESS_RULES,
  );

  const fromNextSteps = generateMissionsFromNextSteps(
    input.nextSteps,
    input.referenceDate,
    rules,
  );
  const fromAchievements = generateMissionsFromAchievements(input.gamification, rules);
  const fromBusiness = generateMissionsFromBusiness(
    input.monthlyChallenge,
    input.referenceDate,
    rules,
  );
  const fromPromotion = generateMissionsFromPromotion(
    input.promotionProgress,
    input.referenceDate,
    rules,
  );
  const fromQualification = generateMissionsFromQualification(
    input.qualificationResults,
    input.referenceDate,
    rules,
  );
  const fromAdventure = adventure.steps
    .map((step) => adventureStepToMission(step, rules))
    .filter((mission): mission is Mission => mission !== null);

  const allMissions = dedupeMissions([
    ...fromQualification,
    ...fromPromotion,
    ...fromNextSteps,
    ...fromAchievements,
    ...fromBusiness,
    ...fromAdventure,
  ]);

  const dailyMissions = selectDailyMissions(allMissions, rules);

  return {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    dailyMissionSet: {
      memberId: input.memberId,
      referenceDate: input.referenceDate,
      missions: dailyMissions,
      minCount: rules.dailyMissionSet.minCount,
      maxCount: rules.dailyMissionSet.maxCount,
      computedAt: new Date(),
    },
    allMissions,
    adventure,
    computedAt: new Date(),
  };
}
