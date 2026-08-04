import type { EntityId } from "@/types";
import { clampPercent, collectDownlineIds } from "./utils";
import {
  DEFAULT_PROMOTION_TREE,
  resolvePromotionRankId,
  type PromotionRankId,
  type PromotionTree,
} from "./rules/promotion";
import type { QualificationResult } from "./qualification/types";
import { DEFAULT_QUALIFICATION_RULES } from "./rules/qualification";
import { selectActiveQualificationResult } from "./qualification/build-next-steps";

export interface PromotionOrganizationMember {
  id: EntityId;
  rankKey: string;
  sponsorMemberId?: EntityId;
}

export interface PromotionOrganization {
  organizationId: EntityId;
  members: PromotionOrganizationMember[];
}

export interface CalculatePromotionProgressInput {
  member: {
    id: EntityId;
    rankKey: string;
  };
  organization: PromotionOrganization;
  qualificationResults?: QualificationResult[];
}

export type PromotionProgressSource = "qualification" | "downline" | "rule_missing";

export interface PromotionProgress {
  memberId: EntityId;
  currentRankId: PromotionRankId | null;
  currentRankName: string;
  nextRankId: PromotionRankId | null;
  nextRankName: string | null;
  downlineRankId: PromotionRankId | null;
  downlineRankName: string | null;
  current: number;
  target: number | null;
  remaining: number | null;
  progressPercent: number | null;
  ruleKey: string | null;
  description: string;
  badge: string | null;
  themeColor: string | null;
  isRuleMissing: boolean;
  isMaxRank: boolean;
  progressSource: PromotionProgressSource;
  qualificationResult: QualificationResult | null;
  computedAt: Date;
}

function countDownlineAtRank(
  members: PromotionOrganizationMember[],
  rootMemberId: EntityId,
  downlineRankId: PromotionRankId,
): number {
  const downlineIds = collectDownlineIds(members, rootMemberId);
  return members.filter(
    (member) =>
      downlineIds.has(member.id) &&
      resolvePromotionRankId(member.rankKey) === downlineRankId,
  ).length;
}

function findActivePromotionRule(
  tree: PromotionTree,
  currentRankId: PromotionRankId,
) {
  return tree.rules.find((rule) => rule.fromRankId === currentRankId) ?? null;
}

function applyPromotionTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

function buildProgressFromQualification(
  base: Omit<
    PromotionProgress,
    | "current"
    | "target"
    | "remaining"
    | "progressPercent"
    | "description"
    | "isRuleMissing"
    | "progressSource"
    | "qualificationResult"
  >,
  qualification: QualificationResult,
): PromotionProgress {
  if (qualification.isRuleMissing) {
    return {
      ...base,
      current: 0,
      target: null,
      remaining: null,
      progressPercent: null,
      description: qualification.description,
      isRuleMissing: true,
      progressSource: "rule_missing",
      qualificationResult: qualification,
    };
  }

  const primaryGap =
    qualification.gaps.sort((left, right) => right.remaining - left.remaining)[0] ?? null;

  if (!primaryGap) {
    return {
      ...base,
      current: 0,
      target: qualification.isQualified ? 0 : null,
      remaining: 0,
      progressPercent: qualification.overallProgressPercent,
      description: qualification.description,
      isRuleMissing: false,
      progressSource: "qualification",
      qualificationResult: qualification,
    };
  }

  return {
    ...base,
    current: primaryGap.current,
    target: primaryGap.target,
    remaining: primaryGap.remaining,
    progressPercent: primaryGap.progressPercent,
    description: `${primaryGap.label} — 目前 ${primaryGap.current}，尚差 ${primaryGap.remaining}`,
    isRuleMissing: false,
    progressSource: "qualification",
    qualificationResult: qualification,
  };
}

/**
 * Computes promotion progress toward the next rank from Promotion + Qualification Rules.
 */
export function calculatePromotionProgress(
  input: CalculatePromotionProgressInput,
  tree: PromotionTree = DEFAULT_PROMOTION_TREE,
): PromotionProgress {
  const currentRankId = resolvePromotionRankId(input.member.rankKey);
  const computedAt = new Date();
  const qualificationResults = input.qualificationResults ?? [];

  if (!currentRankId) {
    return {
      memberId: input.member.id,
      currentRankId: null,
      currentRankName: "",
      nextRankId: null,
      nextRankName: null,
      downlineRankId: null,
      downlineRankName: null,
      current: 0,
      target: null,
      remaining: null,
      progressPercent: null,
      ruleKey: null,
      description: "",
      badge: null,
      themeColor: null,
      isRuleMissing: true,
      isMaxRank: false,
      progressSource: "rule_missing",
      qualificationResult: null,
      computedAt,
    };
  }

  const currentRank = tree.ranks[currentRankId];
  const nextRankId = currentRank.nextRank;

  if (!nextRankId) {
    return {
      memberId: input.member.id,
      currentRankId,
      currentRankName: currentRank.name,
      nextRankId: null,
      nextRankName: null,
      downlineRankId: null,
      downlineRankName: null,
      current: 0,
      target: null,
      remaining: null,
      progressPercent: 100,
      ruleKey: null,
      description: currentRank.description,
      badge: currentRank.badge,
      themeColor: currentRank.themeColor,
      isRuleMissing: false,
      isMaxRank: true,
      progressSource: "qualification",
      qualificationResult: null,
      computedAt,
    };
  }

  const nextRank = tree.ranks[nextRankId];
  const entryRuleKey = DEFAULT_QUALIFICATION_RULES.rankEntryRuleKeys[nextRankId];
  const activeQualification = selectActiveQualificationResult(qualificationResults, nextRankId);

  const base = {
    memberId: input.member.id,
    currentRankId,
    currentRankName: currentRank.name,
    nextRankId,
    nextRankName: nextRank.name,
    downlineRankId: null as PromotionRankId | null,
    downlineRankName: null as string | null,
    ruleKey: entryRuleKey ?? null,
    badge: nextRank.badge,
    themeColor: nextRank.themeColor,
    isMaxRank: false,
    computedAt,
  };

  if (entryRuleKey && activeQualification) {
    return buildProgressFromQualification(base, activeQualification);
  }

  if (entryRuleKey && !activeQualification) {
    const missingResult = qualificationResults.find(
      (result) => result.ruleKey === entryRuleKey,
    );
    if (missingResult) {
      return buildProgressFromQualification(base, missingResult);
    }
    return {
      ...base,
      current: 0,
      target: null,
      remaining: null,
      progressPercent: null,
      description: nextRank.description,
      isRuleMissing: true,
      progressSource: "rule_missing",
      qualificationResult: null,
    };
  }

  const promotionRule = findActivePromotionRule(tree, currentRankId);
  const requirement = promotionRule?.requirement ?? currentRank.requirement;

  if (
    !requirement ||
    requirement.requiredCount === null ||
    requirement.requiredCount === undefined ||
    Number.isNaN(requirement.requiredCount)
  ) {
    return {
      ...base,
      current: 0,
      target: null,
      remaining: null,
      progressPercent: null,
      ruleKey: promotionRule?.ruleKey ?? `promotion_${currentRankId}_to_${nextRankId}`,
      description: currentRank.description,
      isRuleMissing: true,
      progressSource: "rule_missing",
      qualificationResult: null,
    };
  }

  const downlineRank = tree.ranks[requirement.downlineRankId];
  const current = countDownlineAtRank(
    input.organization.members,
    input.member.id,
    requirement.downlineRankId,
  );
  const target = requirement.requiredCount;
  const remaining = Math.max(0, target - current);
  const progressPercent = clampPercent((current / target) * 100);
  const description = applyPromotionTemplate(requirement.descriptionTemplate, {
    requiredCount: target,
    downlineRankName: downlineRank.name,
    nextRankName: nextRank.name,
    current,
    target,
    remaining,
    progressPercent,
  });

  return {
    ...base,
    downlineRankId: requirement.downlineRankId,
    downlineRankName: downlineRank.name,
    current,
    target,
    remaining,
    progressPercent,
    ruleKey: promotionRule?.ruleKey ?? `promotion_${currentRankId}_to_${nextRankId}`,
    description,
    isRuleMissing: false,
    progressSource: "downline",
    qualificationResult: null,
  };
}
