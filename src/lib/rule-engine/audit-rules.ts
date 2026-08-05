import { DEFAULT_BUSINESS_RULES, type BusinessRulesConfig } from "@/lib/business-engine/rules";
import { DEFAULT_MISSION_RULES, type MissionRulesConfig } from "@/lib/mission-engine/rules";
import { DEFAULT_PROMOTION_TREE, type PromotionTree } from "@/lib/business-engine/rules/promotion";
import { auditQualificationRules } from "./audit-qualification-rules";
import { auditVpRules } from "./audit-vp-rules";
import { resolveVpTargetAmount } from "@/lib/business-engine/rules/vp";
import type { RuleMissingEntry } from "@/types/rule-engine";

function pushMissing(
  entries: RuleMissingEntry[],
  ruleKey: string,
  engine: string,
  target: number | null | undefined,
): void {
  if (target === null || target === undefined || Number.isNaN(target)) {
    entries.push({ ruleKey, engine });
  }
}

export function auditBusinessRules(
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): RuleMissingEntry[] {
  const entries: RuleMissingEntry[] = [];

  Object.entries(rules.rankQualification).forEach(([rankKey, qualification]) => {
    qualification.criteria.forEach((criterion) => {
      pushMissing(
        entries,
        `rankQualification.${rankKey}.${criterion.criterionKey}.targetValue`,
        "business",
        criterion.targetValue,
      );
    });
  });

  rules.monthlyChallenge.criteria.forEach((criterion) => {
    pushMissing(
      entries,
      `monthlyChallenge.${criterion.criterionKey}.targetValue`,
      "business",
      criterion.targetValue,
    );
  });

  rules.nextSteps.vpRankSteps.forEach((step) => {
    if (step.vpTargetKey) {
      pushMissing(
        entries,
        `vpRules.${step.vpTargetKey}`,
        "vp",
        resolveVpTargetAmount(step.vpTargetKey, rules.vp),
      );
    } else {
      pushMissing(entries, `nextSteps.${step.stepKey}.vpTarget`, "next_step", step.vpTarget);
    }
  });

  rules.nextSteps.mapSteps.forEach((step) => {
    pushMissing(
      entries,
      `nextSteps.${step.stepKey}.targetActiveLines`,
      "next_step",
      step.targetActiveLines,
    );
  });

  rules.nextSteps.dailyActivitySteps.forEach((step) => {
    pushMissing(
      entries,
      `nextSteps.${step.stepKey}.dailyTarget`,
      "next_step",
      step.dailyTarget,
    );
  });

  rules.gamification.achievements.forEach((achievement) => {
    pushMissing(
      entries,
      `gamification.${achievement.achievementKey}.threshold`,
      "achievement",
      achievement.threshold,
    );
  });

  return entries;
}

export function auditMissionRules(
  rules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): RuleMissingEntry[] {
  const entries: RuleMissingEntry[] = [];

  pushMissing(
    entries,
    "monthlyChallengeMission.overallTarget",
    "mission",
    rules.monthlyChallengeMission.overallTarget,
  );

  pushMissing(
    entries,
    "streakMaintain.dailyTarget",
    "mission",
    rules.streakMaintain.dailyTarget,
  );

  rules.adventure.steps.forEach((step) => {
    pushMissing(
      entries,
      `adventure.${step.stepKey}.threshold`,
      "adventure",
      step.threshold,
    );
  });

  return entries;
}

export function auditPromotionRules(
  tree: PromotionTree = DEFAULT_PROMOTION_TREE,
): RuleMissingEntry[] {
  const entries: RuleMissingEntry[] = [];

  tree.order.forEach((rankId) => {
    const rank = tree.ranks[rankId];
    if (!rank.nextRank) {
      return;
    }

    const explicitRule = tree.rules.find((rule) => rule.fromRankId === rankId);
    const requirement = explicitRule?.requirement ?? rank.requirement;

    pushMissing(
      entries,
      `promotion.${rankId}.requirement.requiredCount`,
      "promotion",
      requirement?.requiredCount ?? null,
    );
  });

  return entries;
}

export function auditAllRules(
  businessRules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
  missionRules: MissionRulesConfig = DEFAULT_MISSION_RULES,
): RuleMissingEntry[] {
  const merged = [
    ...auditBusinessRules(businessRules),
    ...auditMissionRules(missionRules),
    ...auditPromotionRules(businessRules.promotion),
    ...auditQualificationRules(businessRules.qualification),
    ...auditVpRules(businessRules.vp),
  ];
  const seen = new Set<string>();

  return merged.filter((entry) => {
    const key = `${entry.engine}:${entry.ruleKey}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
