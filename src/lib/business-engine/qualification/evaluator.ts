import { clampPercent } from "../utils";
import type {
  QualificationCondition,
  QualificationCompositeCondition,
  QualificationLeafCondition,
  QualificationRule,
} from "../rules/qualification";
import {
  QUALIFICATION_METRICS,
  QUALIFICATION_OPERATORS,
} from "../rules/qualification";
import type {
  QualificationConditionResult,
  QualificationEvaluationContext,
  QualificationGap,
  QualificationMonthlySnapshot,
  QualificationResult,
} from "./types";
import type { PromotionRankId } from "../rules/promotion";
import { DEFAULT_PROMOTION_TREE } from "../rules/promotion";
import { resolveVpTargetAmount } from "../rules/vp";

function applyTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

function isTargetMissing(target: number | null | undefined): boolean {
  return target === null || target === undefined || Number.isNaN(target);
}

function isVpMetric(metric: QualificationLeafCondition["metric"]): boolean {
  return (
    metric === QUALIFICATION_METRICS.VP ||
    metric === QUALIFICATION_METRICS.ORGANIZATION_VP
  );
}

function resolveLeafTarget(leaf: QualificationLeafCondition): {
  target: number | null;
  isRuleMissing: boolean;
} {
  if (isVpMetric(leaf.metric)) {
    if (!leaf.vpTargetKey) {
      return { target: null, isRuleMissing: true };
    }
    const amount = resolveVpTargetAmount(leaf.vpTargetKey);
    return { target: amount, isRuleMissing: amount === null };
  }

  if (isTargetMissing(leaf.target)) {
    return { target: null, isRuleMissing: true };
  }

  return { target: leaf.target, isRuleMissing: false };
}

function resolveLeafMetricValue(
  metric: QualificationLeafCondition["metric"],
  context: QualificationEvaluationContext,
  snapshot?: QualificationMonthlySnapshot,
): number | null {
  const ctx = snapshot ?? {
    yearMonth: context.yearMonth,
    vp: context.vpTotal,
    organizationVp: context.organizationVpTotal,
    mapProgressPercent: context.mapProgressPercent,
    activeLines: context.activeLines,
    activityCounts: context.activityCounts,
    downlineRankCounts: context.downlineRankCounts,
  };

  switch (metric) {
    case QUALIFICATION_METRICS.VP:
      return ctx.vp;
    case QUALIFICATION_METRICS.ORGANIZATION_VP:
      return ctx.organizationVp;
    case QUALIFICATION_METRICS.MAP:
      return ctx.mapProgressPercent;
    case QUALIFICATION_METRICS.ACTIVE_LINE:
      return ctx.activeLines;
    case QUALIFICATION_METRICS.SUPERVISOR_COUNT:
      return ctx.downlineRankCounts.supervisor ?? 0;
    case QUALIFICATION_METRICS.WORLD_TEAM_COUNT:
      return ctx.downlineRankCounts.world_team ?? 0;
    case QUALIFICATION_METRICS.EXPANSION_TEAM_COUNT:
      return ctx.downlineRankCounts.promotion_group ?? 0;
    case QUALIFICATION_METRICS.MILLIONAIRE_TEAM_COUNT:
      return ctx.downlineRankCounts.wealth_group ?? 0;
    case QUALIFICATION_METRICS.PRESIDENT_TEAM_COUNT:
      return ctx.downlineRankCounts.president ?? 0;
    default:
      return null;
  }
}

function buildLeafResult(
  leaf: QualificationLeafCondition,
  context: QualificationEvaluationContext,
): QualificationConditionResult {
  if (
    leaf.metric !== QUALIFICATION_METRICS.CONSECUTIVE_MONTH &&
    leaf.metric !== QUALIFICATION_METRICS.ROLLING_MONTH &&
    leaf.metric !== QUALIFICATION_METRICS.ACTIVITY
  ) {
    const resolved = resolveLeafTarget(leaf);
    if (resolved.isRuleMissing) {
      return {
        conditionKey: leaf.conditionKey,
        metric: leaf.metric,
        label: applyTemplate(leaf.labelTemplate, { target: "?" }),
        current: null,
        target: null,
        remaining: null,
        progressPercent: null,
        isSatisfied: false,
        isRuleMissing: true,
      };
    }
  }

  if (leaf.metric === QUALIFICATION_METRICS.ACTIVITY) {
    if (!leaf.activityKey || isTargetMissing(leaf.target)) {
      return {
        conditionKey: leaf.conditionKey,
        metric: leaf.metric,
        label: leaf.labelTemplate,
        current: null,
        target: null,
        remaining: null,
        progressPercent: null,
        isSatisfied: false,
        isRuleMissing: true,
      };
    }
    const current = context.activityCounts[leaf.activityKey] ?? 0;
    const target = leaf.target as number;
    const remaining = Math.max(0, target - current);
    const progressPercent = clampPercent((current / target) * 100);
    return {
      conditionKey: leaf.conditionKey,
      metric: leaf.metric,
      label: applyTemplate(leaf.labelTemplate, { target, current, remaining }),
      current,
      target,
      remaining,
      progressPercent,
      isSatisfied: current >= target,
      isRuleMissing: false,
    };
  }

  if (leaf.metric === QUALIFICATION_METRICS.CONSECUTIVE_MONTH) {
    return evaluateConsecutiveMonth(leaf, context);
  }

  if (leaf.metric === QUALIFICATION_METRICS.ROLLING_MONTH) {
    return evaluateRollingMonth(leaf, context);
  }

  const resolved = resolveLeafTarget(leaf);
  const current = resolveLeafMetricValue(leaf.metric, context) ?? 0;
  const target = resolved.target as number;
  const remaining = Math.max(0, target - current);
  const progressPercent = clampPercent((current / target) * 100);

  return {
    conditionKey: leaf.conditionKey,
    metric: leaf.metric,
    label: applyTemplate(leaf.labelTemplate, { target, current, remaining }),
    current,
    target,
    remaining,
    progressPercent,
    isSatisfied: current >= target,
    isRuleMissing: false,
  };
}

function evaluateExpressionForSnapshot(
  condition: QualificationCondition,
  context: QualificationEvaluationContext,
  snapshot: QualificationMonthlySnapshot,
): boolean {
  const evaluator = new QualificationEvaluator(context);
  const result = evaluator.evaluateCondition(condition, snapshot);
  return result.isSatisfied;
}

function evaluateConsecutiveMonth(
  leaf: QualificationLeafCondition,
  context: QualificationEvaluationContext,
): QualificationConditionResult {
  if (isTargetMissing(leaf.target) || !leaf.monthExpression) {
    return {
      conditionKey: leaf.conditionKey,
      metric: leaf.metric,
      label: leaf.labelTemplate,
      current: null,
      target: null,
      remaining: null,
      progressPercent: null,
      isSatisfied: false,
      isRuleMissing: true,
    };
  }

  const target = leaf.target as number;
  const sortedSnapshots = [...context.monthlySnapshots].sort((a, b) =>
    b.yearMonth.localeCompare(a.yearMonth),
  );

  let consecutive = 0;
  for (const snapshot of sortedSnapshots) {
    if (evaluateExpressionForSnapshot(leaf.monthExpression, context, snapshot)) {
      consecutive += 1;
    } else {
      break;
    }
  }

  const remaining = Math.max(0, target - consecutive);
  const progressPercent = clampPercent((consecutive / target) * 100);

  return {
    conditionKey: leaf.conditionKey,
    metric: leaf.metric,
    label: applyTemplate(leaf.labelTemplate, { target, current: consecutive, remaining }),
    current: consecutive,
    target,
    remaining,
    progressPercent,
    isSatisfied: consecutive >= target,
    isRuleMissing: false,
  };
}

function evaluateRollingMonth(
  leaf: QualificationLeafCondition,
  context: QualificationEvaluationContext,
): QualificationConditionResult {
  const windowSize = leaf.rollingWindowMonths ?? leaf.target;
  if (isTargetMissing(windowSize) || !leaf.monthExpression) {
    return {
      conditionKey: leaf.conditionKey,
      metric: leaf.metric,
      label: leaf.labelTemplate,
      current: null,
      target: null,
      remaining: null,
      progressPercent: null,
      isSatisfied: false,
      isRuleMissing: true,
    };
  }

  const target = windowSize as number;
  const sortedSnapshots = [...context.monthlySnapshots]
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
    .slice(0, target);

  let satisfiedMonths = 0;
  for (const snapshot of sortedSnapshots) {
    if (evaluateExpressionForSnapshot(leaf.monthExpression, context, snapshot)) {
      satisfiedMonths += 1;
    }
  }

  const remaining = Math.max(0, target - satisfiedMonths);
  const progressPercent = clampPercent((satisfiedMonths / target) * 100);

  return {
    conditionKey: leaf.conditionKey,
    metric: leaf.metric,
    label: applyTemplate(leaf.labelTemplate, {
      target,
      current: satisfiedMonths,
      remaining,
    }),
    current: satisfiedMonths,
    target,
    remaining,
    progressPercent,
    isSatisfied: satisfiedMonths >= target,
    isRuleMissing: false,
  };
}

function aggregateCompositeProgress(
  children: QualificationConditionResult[],
): number | null {
  const valid = children.filter((child) => child.progressPercent !== null);
  if (valid.length === 0) {
    return null;
  }
  return clampPercent(
    valid.reduce((sum, child) => sum + (child.progressPercent ?? 0), 0) / valid.length,
  );
}

export class QualificationEvaluator {
  constructor(private readonly context: QualificationEvaluationContext) {}

  evaluateCondition(
    condition: QualificationCondition,
    snapshot?: QualificationMonthlySnapshot,
  ): QualificationConditionResult {
    if (condition.kind === "leaf") {
      if (snapshot) {
        return this.evaluateLeafForSnapshot(condition, snapshot);
      }
      return buildLeafResult(condition, this.context);
    }
    return this.evaluateComposite(condition);
  }

  private evaluateLeafForSnapshot(
    leaf: QualificationLeafCondition,
    snapshot: QualificationMonthlySnapshot,
  ): QualificationConditionResult {
    const resolved = resolveLeafTarget(leaf);
    if (resolved.isRuleMissing) {
      return {
        conditionKey: leaf.conditionKey,
        metric: leaf.metric,
        label: leaf.labelTemplate,
        current: null,
        target: null,
        remaining: null,
        progressPercent: null,
        isSatisfied: false,
        isRuleMissing: true,
      };
    }

    const current = resolveLeafMetricValue(leaf.metric, this.context, snapshot) ?? 0;
    const target = resolved.target as number;
    return {
      conditionKey: leaf.conditionKey,
      metric: leaf.metric,
      label: applyTemplate(leaf.labelTemplate, { target, current }),
      current,
      target,
      remaining: Math.max(0, target - current),
      progressPercent: clampPercent((current / target) * 100),
      isSatisfied: current >= target,
      isRuleMissing: false,
    };
  }

  private evaluateComposite(
    composite: QualificationCompositeCondition,
  ): QualificationConditionResult {
    const children = composite.conditions.map((child) =>
      this.evaluateCondition(child),
    );

    const hasMissing = children.some((child) => child.isRuleMissing);

    let isSatisfied = false;
    switch (composite.operator) {
      case QUALIFICATION_OPERATORS.AND:
      case QUALIFICATION_OPERATORS.ALL:
        isSatisfied = children.length > 0 && children.every((child) => child.isSatisfied);
        break;
      case QUALIFICATION_OPERATORS.OR:
        isSatisfied = children.some((child) => child.isSatisfied);
        break;
      case QUALIFICATION_OPERATORS.NOT:
        isSatisfied = children[0] ? !children[0].isSatisfied : false;
        break;
      case QUALIFICATION_OPERATORS.ANY: {
        const min = composite.minSatisfied;
        if (isTargetMissing(min)) {
          return {
            conditionKey: composite.conditionKey,
            metric: "composite",
            operator: composite.operator,
            label: composite.labelTemplate ?? composite.conditionKey,
            current: null,
            target: null,
            remaining: null,
            progressPercent: null,
            isSatisfied: false,
            isRuleMissing: true,
            children,
          };
        }
        const satisfiedCount = children.filter((child) => child.isSatisfied).length;
        isSatisfied = satisfiedCount >= (min as number);
        break;
      }
      default:
        isSatisfied = false;
    }

    return {
      conditionKey: composite.conditionKey,
      metric: "composite",
      operator: composite.operator,
      label: composite.labelTemplate ?? composite.conditionKey,
      current: null,
      target: null,
      remaining: null,
      progressPercent: aggregateCompositeProgress(children),
      isSatisfied,
      isRuleMissing: hasMissing,
      children,
    };
  }

  collectGaps(
    node: QualificationConditionResult,
    rule: QualificationRule,
    targetRankName: string,
  ): QualificationGap[] {
    if (node.isRuleMissing) {
      return [];
    }

    if (
      node.metric !== "composite" &&
      !node.isSatisfied &&
      node.current !== null &&
      node.target !== null &&
      node.remaining !== null &&
      node.progressPercent !== null
    ) {
      return [
        {
          gapKey: `${rule.ruleKey}.${node.conditionKey}`,
          conditionKey: node.conditionKey,
          metric: node.metric as QualificationGap["metric"],
          label: node.label,
          current: node.current,
          target: node.target,
          remaining: node.remaining,
          progressPercent: node.progressPercent,
          unit: "",
          targetRankId: rule.targetRankId,
          targetRankName,
        },
      ];
    }

    return (node.children ?? []).flatMap((child) =>
      this.collectGaps(child, rule, targetRankName),
    );
  }
}

export function evaluateQualification(
  rule: QualificationRule,
  context: QualificationEvaluationContext,
): QualificationResult {
  const evaluator = new QualificationEvaluator(context);
  const root = evaluator.evaluateCondition(rule.root);
  const targetRankName =
    DEFAULT_PROMOTION_TREE.ranks[rule.targetRankId]?.name ?? rule.targetRankId;
  const gaps = evaluator.collectGaps(root, rule, targetRankName);

  return {
    ruleKey: rule.ruleKey,
    name: rule.name,
    targetRankId: rule.targetRankId,
    targetRankName,
    description: rule.description,
    isQualified: root.isSatisfied && !root.isRuleMissing,
    isRuleMissing: root.isRuleMissing,
    overallProgressPercent: root.progressPercent,
    root,
    gaps,
    computedAt: new Date(),
  };
}

export function evaluateQualifications(
  ruleKeys: string[],
  rules: Record<string, QualificationRule>,
  context: QualificationEvaluationContext,
): QualificationResult[] {
  return ruleKeys
    .map((ruleKey) => rules[ruleKey])
    .filter((rule): rule is QualificationRule => rule !== undefined)
    .map((rule) => evaluateQualification(rule, context));
}

export function evaluateQualificationForRank(
  targetRankId: PromotionRankId,
  rankEntryRuleKeys: Partial<Record<PromotionRankId, string>>,
  rules: Record<string, QualificationRule>,
  context: QualificationEvaluationContext,
): QualificationResult | null {
  const ruleKey = rankEntryRuleKeys[targetRankId];
  if (!ruleKey) {
    return null;
  }
  const rule = rules[ruleKey];
  if (!rule) {
    return null;
  }
  return evaluateQualification(rule, context);
}
