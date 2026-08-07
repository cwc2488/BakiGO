import type { PriorityCandidate, PresidentAIInput } from "./types";
import { isPromotionCoveredByNextSteps } from "@/lib/business-engine/next-step/promotion-step-dedupe";
import {
  resolveCategoryFromCriterionKey,
  resolveCategoryFromMetric,
  resolveCategoryFromStepKey,
} from "./map-category";
import { scoreFromProgress } from "./score-priority";

function pushCandidate(
  candidates: PriorityCandidate[],
  candidate: PriorityCandidate,
): void {
  const isReady =
    candidate.sourceKey.startsWith("promotion_ready_") ||
    candidate.sourceKey === "vp_complete_shift_downline";

  if (candidate.remaining <= 0 && !isReady && candidate.progressPercent !== 100) {
    return;
  }

  candidates.push(candidate);
}

function dedupeCandidatesByTitle(candidates: PriorityCandidate[]): PriorityCandidate[] {
  const seen = new Set<string>();
  const result: PriorityCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.title.trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function collectPriorityCandidates(input: PresidentAIInput): PriorityCandidate[] {
  const candidates: PriorityCandidate[] = [];

  input.nextSteps.forEach((step) => {
    pushCandidate(candidates, {
      sourceKey: step.stepKey,
      title: step.title,
      description: step.description,
      category: resolveCategoryFromStepKey(step.stepKey),
      current: step.current,
      target: step.target,
      remaining: step.remaining,
      progressPercent: step.progressPercent,
      enginePriority: step.priority,
    });
  });

  input.qualificationResults.forEach((result) => {
    if (result.isRuleMissing || result.isQualified) {
      return;
    }

    result.gaps.forEach((gap) => {
      pushCandidate(candidates, {
        sourceKey: gap.gapKey,
        title: `${result.targetRankName} — ${gap.label}`,
        description: `目前 ${gap.current} / ${gap.target}，還差 ${gap.remaining}`,
        category: resolveCategoryFromMetric(gap.metric),
        current: gap.current,
        target: gap.target,
        remaining: gap.remaining,
        progressPercent: gap.progressPercent,
        enginePriority: result.overallProgressPercent ?? 0,
      });
    });
  });

  if (
    !input.promotionProgress.isMaxRank &&
    !input.promotionProgress.isRuleMissing &&
    input.promotionProgress.target !== null &&
    input.promotionProgress.remaining !== null
  ) {
    if (input.promotionProgress.remaining <= 0) {
      pushCandidate(candidates, {
        sourceKey: `promotion_ready_${input.promotionProgress.ruleKey ?? "rank"}`,
        title: "立即晉升",
        description: input.promotionProgress.description,
        category: "PROMOTION",
        current: input.promotionProgress.current,
        target: input.promotionProgress.target,
        remaining: 0,
        progressPercent: 100,
        enginePriority: 1000,
      });
    } else if (
      input.promotionProgress.progressSource === "downline" &&
      !isPromotionCoveredByNextSteps(input.nextSteps, input.promotionProgress)
    ) {
      pushCandidate(candidates, {
        sourceKey: `promotion_${input.promotionProgress.ruleKey ?? "downline"}`,
        title: input.promotionProgress.nextRankName
          ? `培養${input.promotionProgress.downlineRankName ?? "下線"}`
          : input.promotionProgress.description,
        description: input.promotionProgress.description,
        category: "PROMOTION",
        current: input.promotionProgress.current,
        target: input.promotionProgress.target,
        remaining: input.promotionProgress.remaining,
        progressPercent: input.promotionProgress.progressPercent,
        enginePriority: input.promotionProgress.progressPercent ?? 0,
      });
    }
  }

  const vpGapsOpen = input.qualificationResults.some((result) =>
    result.gaps.some(
      (gap) =>
        (gap.metric === "vp" || gap.metric === "organization_vp") && gap.remaining > 0,
    ),
  );

  if (!vpGapsOpen && input.promotionProgress.progressSource === "qualification") {
    const downlineStep = input.nextSteps.find((step) => step.stepKey.startsWith("promotion_"));
    if (downlineStep) {
      pushCandidate(candidates, {
        sourceKey: "vp_complete_shift_downline",
        title: "VP 目標已達成 — 開始培養下線",
        description: downlineStep.description,
        category: "PROMOTION",
        current: downlineStep.current,
        target: downlineStep.target,
        remaining: downlineStep.remaining,
        progressPercent: downlineStep.progressPercent,
        enginePriority: downlineStep.priority,
      });
    }
  }

  if (input.map.totalLines !== null && input.map.progressPercent !== null) {
    const remainingLines = Math.max(0, input.map.totalLines - input.map.activeLines);
    if (remainingLines > 0) {
      pushCandidate(candidates, {
        sourceKey: "map_active_lines",
        title: "培育活躍督導",
        description: `目前已有 ${input.map.activeLines} 條活躍督導，目標 ${input.map.totalLines} 條`,
        category: "MAP",
        current: input.map.activeLines,
        target: input.map.totalLines,
        remaining: remainingLines,
        progressPercent: input.map.progressPercent,
        enginePriority: input.map.progressPercent ?? 0,
      });
    }
  }

  input.monthlyChallenge.criteria.forEach((criterion) => {
    const remaining = Math.max(0, criterion.targetValue - criterion.currentValue);
    if (remaining <= 0) {
      return;
    }

    pushCandidate(candidates, {
      sourceKey: `challenge_${criterion.criterionKey}`,
      title: criterion.label,
      description: `${input.monthlyChallenge.title} — 目前 ${criterion.currentValue} / ${criterion.targetValue}`,
      category: resolveCategoryFromCriterionKey(criterion.criterionKey),
      current: criterion.currentValue,
      target: criterion.targetValue,
      remaining,
      progressPercent: criterion.progressPercent,
      enginePriority: criterion.progressPercent,
    });
  });

  const retailHouseTotal = input.retailHouse.houses.reduce(
    (sum, house) => sum + house.transactionCount,
    0,
  );
  const challengeRetailCriteria = input.monthlyChallenge.criteria.filter((criterion) =>
    criterion.criterionKey.includes("retail"),
  );

  if (challengeRetailCriteria.length > 0) {
    const lowestProgress = challengeRetailCriteria.reduce((lowest, criterion) =>
      criterion.progressPercent < lowest.progressPercent ? criterion : lowest,
    );

    if (lowestProgress.targetValue - lowestProgress.currentValue > 0) {
      pushCandidate(candidates, {
        sourceKey: `retail_house_${lowestProgress.criterionKey}`,
        title: "提高零售屋成交",
        description: `${lowestProgress.label} — 目前 ${lowestProgress.currentValue} / ${lowestProgress.targetValue}`,
        category: "RETAIL",
        current: lowestProgress.currentValue,
        target: lowestProgress.targetValue,
        remaining: Math.max(0, lowestProgress.targetValue - lowestProgress.currentValue),
        progressPercent: lowestProgress.progressPercent,
        enginePriority: lowestProgress.progressPercent,
      });
    }
  } else if (retailHouseTotal === 0 && input.retailHouse.houses.length > 0) {
    const retailStep = input.nextSteps.find((step) => step.stepKey.includes("retail"));
    if (retailStep) {
      pushCandidate(candidates, {
        sourceKey: retailStep.stepKey,
        title: "提高零售屋成交",
        description: retailStep.description,
        category: "RETAIL",
        current: retailStep.current,
        target: retailStep.target,
        remaining: retailStep.remaining,
        progressPercent: retailStep.progressPercent,
        enginePriority: retailStep.priority,
      });
    }
  }

  input.missions.dailyMissionSet.missions.forEach((mission) => {
    if (mission.remaining <= 0) {
      return;
    }

    pushCandidate(candidates, {
      sourceKey: mission.id,
      title: mission.title,
      description: mission.description,
      category: "MISSION",
      current: mission.current,
      target: mission.target,
      remaining: mission.remaining,
      progressPercent: mission.progress,
      enginePriority: mission.priority,
    });
  });

  input.memberGoals.forEach((goal) => {
    if (goal.remaining <= 0) {
      return;
    }

    const category =
      goal.type === "monthly_vp"
        ? "VP"
        : goal.type === "monthly_new_customers"
          ? "RETAIL"
          : "RETAIL";

    pushCandidate(candidates, {
      sourceKey: `member_goal_${goal.goalId}`,
      title: goal.title,
      description: goal.description,
      category,
      current: goal.current,
      target: goal.target,
      remaining: goal.remaining,
      progressPercent: goal.progressPercent,
      enginePriority: goal.horizon === "short" ? 3000 : goal.horizon === "medium" ? 2000 : 1500,
      actionHref: goal.actionSteps[0]?.href,
    });
  });

  if (input.careerGoal && input.careerGoal.remaining > 0) {
    const coveredByNextStep = input.nextSteps.some(
      (step) => step.stepKey === input.careerGoal!.sourceKey,
    );
    if (!coveredByNextStep) {
      pushCandidate(candidates, {
        sourceKey: input.careerGoal.sourceKey,
        title: input.careerGoal.title,
        description: input.careerGoal.description,
        category: "PROMOTION",
        current: input.careerGoal.current,
        target: input.careerGoal.target,
        remaining: input.careerGoal.remaining,
        progressPercent: input.careerGoal.progressPercent,
        enginePriority: 2500,
        actionHref: input.careerGoal.actionSteps[0]?.href,
      });
    }
  }

  if (input.rankGuidance && input.rankGuidance.actionSteps.length > 0) {
    pushCandidate(candidates, {
      sourceKey: "rank_daily_guidance",
      title: input.rankGuidance.title,
      description: input.rankGuidance.description,
      category: input.rankGuidance.mode === "organization" ? "PROMOTION" : "ACTIVE",
      current: 0,
      target: 1,
      remaining: 1,
      progressPercent: 0,
      enginePriority: input.rankGuidance.mode === "organization" ? 2600 : 2400,
      actionHref: input.rankGuidance.actionSteps[0]?.href,
    });
  }

  return dedupeCandidatesByTitle(candidates);
}

export function candidatesToPriorities(
  candidates: PriorityCandidate[],
): Array<PriorityCandidate & { score: number }> {
  return candidates.map((candidate) => ({
    ...candidate,
    score: scoreFromProgress(
      candidate.progressPercent,
      candidate.remaining,
      candidate.target,
    ),
  }));
}
