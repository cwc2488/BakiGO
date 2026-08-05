import type { Opportunity, Warning } from "@/types/president-ai";
import type { PresidentAIInput } from "./types";
import { resolveCategoryFromMetric } from "./map-category";
import { scoreFromProgress } from "./score-priority";

export function collectWarnings(input: PresidentAIInput): Warning[] {
  const warnings: Warning[] = [];

  if (input.ruleMissing.entries.length > 0) {
    input.ruleMissing.entries.forEach((entry) => {
      warnings.push({
        warningKey: entry.ruleKey,
        message: `Rule Missing：${entry.ruleKey}（${entry.engine}）`,
        category: "SYSTEM",
      });
    });
  }

  input.qualificationResults.forEach((result) => {
    if (result.isRuleMissing) {
      warnings.push({
        warningKey: `qualification_${result.ruleKey}`,
        message: `${result.targetRankName} 資格條件尚未完整定義`,
        category: "QUALIFICATION",
      });
    }
  });

  if (input.promotionProgress.isRuleMissing) {
    warnings.push({
      warningKey: `promotion_${input.promotionProgress.ruleKey ?? "unknown"}`,
      message: `${input.promotionProgress.currentRankName} 晉升條件尚未完整定義`,
      category: "PROMOTION",
    });
  }

  if (input.gamification.streak.currentStreak > 0 && !input.gamification.streak.isActiveToday) {
    warnings.push({
      warningKey: "streak_inactive_today",
      message: "今日尚未完成活動，連續紀錄可能中斷",
      category: "ACTIVE",
    });
  }

  return warnings;
}

export function collectOpportunities(input: PresidentAIInput): Opportunity[] {
  const opportunities: Opportunity[] = [];

  input.qualificationResults.forEach((result) => {
    if (result.isRuleMissing || result.isQualified) {
      return;
    }

    result.gaps.forEach((gap) => {
      const score = scoreFromProgress(gap.progressPercent, gap.remaining, gap.target);
      if (gap.remaining <= 0) {
        return;
      }

      opportunities.push({
        opportunityKey: gap.gapKey,
        title: gap.label,
        description: `距離 ${result.targetRankName} 還差 ${gap.remaining}`,
        category: resolveCategoryFromMetric(gap.metric),
        score,
      });
    });
  });

  if (
    !input.promotionProgress.isRuleMissing &&
    !input.promotionProgress.isMaxRank &&
    input.promotionProgress.remaining !== null &&
    input.promotionProgress.remaining > 0 &&
    input.promotionProgress.progressPercent !== null
  ) {
    opportunities.push({
      opportunityKey: `promotion_${input.promotionProgress.ruleKey ?? "next"}`,
      title: input.promotionProgress.nextRankName ?? "下一階",
      description: input.promotionProgress.description,
      category: "PROMOTION",
      score: input.promotionProgress.progressPercent,
    });
  }

  input.missions.dailyMissionSet.missions.forEach((mission) => {
    if (mission.remaining <= 0) {
      return;
    }

    opportunities.push({
      opportunityKey: mission.id,
      title: mission.title,
      description: mission.description,
      category: "MISSION",
      score: mission.progress,
    });
  });

  return opportunities.sort((left, right) => right.score - left.score);
}
