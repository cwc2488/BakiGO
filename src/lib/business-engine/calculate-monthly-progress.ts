import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import type { CalculateMonthlyProgressInput } from "./types";
import type { VPTransaction } from "@/types/vp";
import {
  calculateWeightedProgress,
  countActivitiesByKey,
  criterionProgress,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
  isInYearMonth,
} from "./utils";

function sumVpForCriterion(
  criterionKey: string,
  memberId: string,
  yearMonth: string,
  vpTransactions: VPTransaction[],
  rules: BusinessRulesConfig,
): number {
  const matchingTypeKeys = rules.retailTransactionTypes
    .filter((type) => type.criterionKey === criterionKey)
    .map((type) => type.key);
  const matchingSourceKeys = rules.vp.sources
    .filter((source) => matchingTypeKeys.includes(source.transactionTypeKey))
    .map((source) => source.sourceKey);

  return vpTransactions
    .filter(
      (transaction) =>
        transaction.memberId === memberId &&
        transaction.qualificationMonth === yearMonth &&
        matchingSourceKeys.includes(transaction.source),
    )
    .reduce((sum, transaction) => sum + transaction.vp, 0);
}

function isVpCriterion(
  criterionKey: string,
  unit: string | undefined,
  rules: BusinessRulesConfig,
): boolean {
  if (unit === "VP") {
    return true;
  }
  return rules.retailTransactionTypes.some(
    (type) => type.criterionKey === criterionKey && type.valueUnit === "VP",
  );
}

function countTransactionsByCriterion(
  transactions: NonNullable<CalculateMonthlyProgressInput["transactions"]>,
  memberId: string,
  yearMonth: string,
  criterionKey: string,
  rules: BusinessRulesConfig,
): number {
  const matchingTypeKeys = rules.retailTransactionTypes
    .filter((type) => type.criterionKey === criterionKey)
    .map((type) => type.key);

  return transactions.filter(
    (transaction) =>
      transaction.memberId === memberId &&
      isInYearMonth(transaction.transactionDate, yearMonth) &&
      matchingTypeKeys.includes(transaction.transactionTypeKey),
  ).length;
}

function resolveCriterionValue(
  criterionKey: string,
  criterionUnit: string | undefined,
  memberId: string,
  yearMonth: string,
  periodActivities: ReturnType<typeof filterActivitiesByYearMonth>,
  transactions: NonNullable<CalculateMonthlyProgressInput["transactions"]>,
  vpTransactions: VPTransaction[] | undefined,
  rules: BusinessRulesConfig,
): number | null {
  if (isVpCriterion(criterionKey, criterionUnit, rules)) {
    if (!vpTransactions) {
      return null;
    }
    return sumVpForCriterion(criterionKey, memberId, yearMonth, vpTransactions, rules);
  }

  const activityCount = countActivitiesByKey(periodActivities, criterionKey);
  const transactionCount = countTransactionsByCriterion(
    transactions,
    memberId,
    yearMonth,
    criterionKey,
    rules,
  );

  return activityCount + transactionCount;
}

/**
 * Computes monthly challenge progress for one member.
 * Criteria and targets come from the challenge definition — not hardcoded here.
 */
export function calculateMonthlyProgress(
  input: CalculateMonthlyProgressInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
) {
  const memberActivities = filterActivitiesByMember(input.activities, input.memberId);
  const periodActivities = filterActivitiesByYearMonth(memberActivities, input.yearMonth);
  const transactions = input.transactions ?? [];
  const vpTransactions = input.vpTransactions;

  const criteria = input.challenge.criteria.flatMap((criterion) => {
    if (
      criterion.targetValue === null ||
      criterion.targetValue === undefined ||
      Number.isNaN(criterion.targetValue)
    ) {
      return [];
    }

    const currentValue = resolveCriterionValue(
      criterion.criterionKey,
      criterion.unit,
      input.memberId,
      input.yearMonth,
      periodActivities,
      transactions,
      vpTransactions,
      rules,
    );

    if (currentValue === null) {
      return [];
    }

    const progressPercent = criterionProgress(currentValue, criterion.targetValue);

    return [
      {
        criterionKey: criterion.criterionKey,
        label: criterion.label,
        currentValue,
        targetValue: criterion.targetValue,
        unit: criterion.unit,
        progressPercent: progressPercent ?? 0,
      },
    ];
  });

  const overallProgressPercent = calculateWeightedProgress(
    criteria.map((item) => ({
      progressPercent: item.progressPercent,
      weight:
        input.challenge.criteria.find(
          (criterion) => criterion.criterionKey === item.criterionKey,
        )?.weight ?? 1,
    })),
  );

  return {
    memberId: input.memberId,
    challengeId: input.challenge.id,
    yearMonth: input.yearMonth,
    title: input.challenge.title,
    overallProgressPercent: overallProgressPercent ?? 0,
    criteria,
    computedAt: input.computedAt ?? new Date(),
  };
}

export function calculateMonthlyProgressPercent(
  input: CalculateMonthlyProgressInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): number {
  return calculateMonthlyProgress(input, rules).overallProgressPercent;
}
