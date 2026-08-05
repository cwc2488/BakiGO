import {
  DEFAULT_QUALIFICATION_RULES,
  QUALIFICATION_METRICS,
  type QualificationCondition,
  type QualificationLeafCondition,
  type QualificationRule,
  type QualificationRulesConfig,
} from "@/lib/business-engine/rules/qualification";
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

function auditCondition(
  entries: RuleMissingEntry[],
  condition: QualificationCondition,
  ruleKey: string,
): void {
  if (condition.kind === "leaf") {
    auditLeaf(entries, condition, ruleKey);
    return;
  }

  condition.conditions.forEach((child) => auditCondition(entries, child, ruleKey));

  if (condition.operator === "any") {
    pushMissing(
      entries,
      `${ruleKey}.${condition.conditionKey}.minSatisfied`,
      "qualification",
      condition.minSatisfied,
    );
  }
}

function auditLeaf(
  entries: RuleMissingEntry[],
  leaf: QualificationLeafCondition,
  ruleKey: string,
): void {
  if (
    leaf.metric === "consecutive_month" ||
    leaf.metric === "rolling_month"
  ) {
    pushMissing(
      entries,
      `${ruleKey}.${leaf.conditionKey}.target`,
      "qualification",
      leaf.target,
    );
    if (!leaf.monthExpression) {
      entries.push({
        ruleKey: `${ruleKey}.${leaf.conditionKey}.monthExpression`,
        engine: "qualification",
      });
    } else {
      auditCondition(entries, leaf.monthExpression, ruleKey);
    }
    return;
  }

  if (leaf.metric === "activity") {
    if (!leaf.activityKey) {
      entries.push({
        ruleKey: `${ruleKey}.${leaf.conditionKey}.activityKey`,
        engine: "qualification",
      });
    }
    pushMissing(
      entries,
      `${ruleKey}.${leaf.conditionKey}.target`,
      "qualification",
      leaf.target,
    );
    return;
  }

  if (
    leaf.metric === QUALIFICATION_METRICS.VP ||
    leaf.metric === QUALIFICATION_METRICS.ORGANIZATION_VP
  ) {
    if (!leaf.vpTargetKey) {
      entries.push({
        ruleKey: `${ruleKey}.${leaf.conditionKey}.vpTargetKey`,
        engine: "qualification",
      });
      return;
    }
    pushMissing(
      entries,
      `vpRules.${leaf.vpTargetKey}`,
      "vp",
      resolveVpTargetAmount(leaf.vpTargetKey),
    );
    return;
  }

  pushMissing(
    entries,
    `${ruleKey}.${leaf.conditionKey}.target`,
    "qualification",
    leaf.target,
  );
}

function auditQualificationRule(entries: RuleMissingEntry[], rule: QualificationRule): void {
  auditCondition(entries, rule.root, rule.ruleKey);
}

export function auditQualificationRules(
  config: QualificationRulesConfig = DEFAULT_QUALIFICATION_RULES,
): RuleMissingEntry[] {
  const entries: RuleMissingEntry[] = [];

  Object.values(config.rules).forEach((rule) => auditQualificationRule(entries, rule));

  if (config.rankEntryRuleKeys) {
    Object.entries(config.rankEntryRuleKeys).forEach(([rankId, ruleKey]) => {
      if (!ruleKey || !config.rules[ruleKey]) {
        entries.push({
          ruleKey: `qualification.rankEntry.${rankId}`,
          engine: "qualification",
        });
      }
    });
  }

  return entries;
}
