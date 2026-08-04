import type { PresidentAIInput } from "./types";

export interface PresidentAIMetricsInput {
  memberId: string;
  computedAt: string;
  nextSteps: PresidentAIInput["nextSteps"];
  qualificationResults: PresidentAIInput["qualificationResults"];
  promotionProgress: PresidentAIInput["promotionProgress"];
  map: PresidentAIInput["map"];
  monthlyChallenge: PresidentAIInput["monthlyChallenge"];
  retailHouse: PresidentAIInput["retailHouse"];
  missions: PresidentAIInput["missions"];
  gamification: PresidentAIInput["gamification"];
  ruleMissing: PresidentAIInput["ruleMissing"];
}

export function toPresidentAIInput(metrics: PresidentAIMetricsInput): PresidentAIInput {
  return {
    memberId: metrics.memberId,
    referenceDate: metrics.computedAt.slice(0, 10),
    nextSteps: metrics.nextSteps,
    qualificationResults: metrics.qualificationResults,
    promotionProgress: metrics.promotionProgress,
    map: {
      activeLines: metrics.map.activeLines,
      totalLines: metrics.map.totalLines,
      progressPercent: metrics.map.progressPercent,
    },
    monthlyChallenge: {
      title: metrics.monthlyChallenge.title,
      overallProgressPercent: metrics.monthlyChallenge.overallProgressPercent,
      criteria: metrics.monthlyChallenge.criteria,
    },
    retailHouse: {
      houses: metrics.retailHouse.houses,
    },
    missions: {
      dailyMissionSet: {
        missions: metrics.missions.dailyMissionSet.missions,
      },
    },
    gamification: {
      streak: {
        currentStreak: metrics.gamification.streak.currentStreak,
        isActiveToday: metrics.gamification.streak.isActiveToday,
      },
    },
    ruleMissing: metrics.ruleMissing,
  };
}
