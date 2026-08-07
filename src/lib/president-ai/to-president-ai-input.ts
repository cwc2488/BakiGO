import type { PresidentAIInput } from "./types";
import type { CareerBlueprintView, MemberGoalProgressView } from "@/types/member-goal";
import type { RankGuidanceView } from "@/lib/member-goals/build-rank-guidance-playbook";

export interface PresidentAIMetricsInput {
  memberId: string;
  referenceDate: string;
  nextSteps: PresidentAIInput["nextSteps"];
  qualificationResults: PresidentAIInput["qualificationResults"];
  promotionProgress: PresidentAIInput["promotionProgress"];
  map: PresidentAIInput["map"];
  monthlyChallenge: PresidentAIInput["monthlyChallenge"];
  retailHouse: PresidentAIInput["retailHouse"];
  missions: PresidentAIInput["missions"];
  gamification: PresidentAIInput["gamification"];
  ruleMissing: PresidentAIInput["ruleMissing"];
  memberGoals?: MemberGoalProgressView[];
  careerGoal?: CareerBlueprintView | null;
  rankGuidance?: RankGuidanceView | null;
}

export function toPresidentAIInput(metrics: PresidentAIMetricsInput): PresidentAIInput {
  return {
    memberId: metrics.memberId,
    referenceDate: metrics.referenceDate,
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
    memberGoals: (metrics.memberGoals ?? []).map((goal) => ({
      goalId: goal.goalId,
      type: goal.type,
      horizon: goal.horizon,
      title: goal.title,
      description: goal.description,
      current: goal.current,
      target: goal.target,
      remaining: goal.remaining,
      progressPercent: goal.progressPercent,
      todayNeeded: goal.todayNeeded,
      unit: goal.unit,
      actionSteps: goal.actionSteps,
    })),
    careerGoal: metrics.careerGoal
      ? {
          title: metrics.careerGoal.title,
          description: metrics.careerGoal.description,
          current: metrics.careerGoal.current,
          target: metrics.careerGoal.target,
          remaining: metrics.careerGoal.remaining,
          progressPercent: metrics.careerGoal.progressPercent,
          sourceKey: metrics.careerGoal.sourceKey,
          actionSteps: metrics.careerGoal.actionSteps,
        }
      : null,
    rankGuidance: metrics.rankGuidance
      ? {
          mode: metrics.rankGuidance.mode,
          title: metrics.rankGuidance.title,
          description: metrics.rankGuidance.description,
          actionSteps: metrics.rankGuidance.actionSteps,
        }
      : null,
  };
}
