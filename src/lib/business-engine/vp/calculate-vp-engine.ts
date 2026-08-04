import type { EntityId, ISODateString, YearMonth } from "@/types";
import type {
  VPBalance,
  VPTransaction,
  VPSnapshot,
  VpBucketKey,
} from "@/types/vp";
import {
  DEFAULT_VP_RULES,
  getVpSourceForTransactionType,
  type VpRulesConfig,
} from "../rules/vp";
import { collectDownlineIds, isInYearMonth } from "../utils";

export interface VpEngineTransactionInput {
  id: string;
  memberId: EntityId;
  transactionDate: ISODateString;
  transactionTypeKey: string;
  amount: number;
  productKey?: string | null;
  retailHouseKey?: string | null;
  status?: "active" | "void";
}

export interface CalculateVPInput {
  memberId: EntityId;
  organizationId: EntityId;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  retailHouseKey?: string | null;
  transactions: VpEngineTransactionInput[];
  members: Array<{ id: EntityId; sponsorMemberId?: EntityId }>;
}

function parseYearMonth(date: ISODateString): { month: string; year: string; yearMonth: YearMonth } {
  const yearMonth = date.slice(0, 7) as YearMonth;
  const [year, month] = yearMonth.split("-");
  return { month, year, yearMonth };
}

function normalizeToVpTransactions(
  transactions: VpEngineTransactionInput[],
  rules: VpRulesConfig,
): VPTransaction[] {
  return transactions.flatMap((transaction) => {
    const source = getVpSourceForTransactionType(transaction.transactionTypeKey, rules);
    if (!source || source.multiplier === null || Number.isNaN(source.multiplier)) {
      return [];
    }
    if (!rules.transactionTypeKeys.includes(transaction.transactionTypeKey)) {
      return [];
    }

    const { month, year, yearMonth } = parseYearMonth(transaction.transactionDate);
    const vp = transaction.amount * source.multiplier;
    const status = transaction.status ?? "active";

    if (status === "void") {
      return [];
    }

    return [
      {
        transactionId: transaction.id,
        date: transaction.transactionDate,
        memberId: transaction.memberId,
        retailHouseId: transaction.retailHouseKey ?? null,
        source: source.sourceKey,
        product: transaction.productKey ?? null,
        vp,
        month,
        year,
        rollingMonth: yearMonth,
        qualificationMonth: yearMonth,
        status,
      },
    ];
  });
}

function sumVp(
  vpTransactions: VPTransaction[],
  filter: (transaction: VPTransaction) => boolean,
): number {
  return vpTransactions.filter(filter).reduce((sum, transaction) => sum + transaction.vp, 0);
}

function buildBalance(
  bucketKey: VpBucketKey,
  amount: number,
  targetKey: string | null,
  rules: VpRulesConfig,
): VPBalance {
  const targetRule = targetKey ? rules.targets[targetKey] : null;
  const targetAmount = targetRule?.amount ?? null;
  return {
    bucketKey,
    amount,
    targetKey,
    targetAmount,
    isRuleMissing: targetKey !== null && targetAmount === null,
  };
}

function sumOrganizationVp(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  members: CalculateVPInput["members"],
  yearMonth: YearMonth,
): number {
  const scopeIds = new Set([memberId, ...collectDownlineIds(members, memberId)]);
  return sumVp(
    vpTransactions,
    (transaction) =>
      scopeIds.has(transaction.memberId) &&
      transaction.qualificationMonth === yearMonth,
  );
}

export function calculateMonthlyVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  yearMonth: YearMonth,
): number {
  return sumVp(
    vpTransactions,
    (transaction) =>
      transaction.memberId === memberId && transaction.qualificationMonth === yearMonth,
  );
}

export function calculateRollingVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  yearMonth: YearMonth,
  windowMonths: number | null,
): number | null {
  if (windowMonths === null || windowMonths === undefined || Number.isNaN(windowMonths)) {
    return null;
  }

  const months: string[] = [];
  const [year, month] = yearMonth.split("-").map(Number);
  for (let index = 0; index < windowMonths; index += 1) {
    const date = new Date(year, month - 1 - index, 1);
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push(ym);
  }

  return sumVp(
    vpTransactions,
    (transaction) =>
      transaction.memberId === memberId && months.includes(transaction.qualificationMonth),
  );
}

export function calculateOrganizationVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  members: CalculateVPInput["members"],
  yearMonth: YearMonth,
): number {
  return sumOrganizationVp(vpTransactions, memberId, members, yearMonth);
}

export function calculateQualificationVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  members: CalculateVPInput["members"],
  yearMonth: YearMonth,
): { personal: number; organization: number } {
  const personal = calculateMonthlyVP(vpTransactions, memberId, yearMonth);
  const organization = calculateOrganizationVP(vpTransactions, memberId, members, yearMonth);
  return { personal, organization };
}

export function calculateLifetimeVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
): number {
  return sumVp(vpTransactions, (transaction) => transaction.memberId === memberId);
}

export function calculateRetailHouseVP(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  retailHouseId: string | null,
  yearMonth: YearMonth,
): number {
  if (!retailHouseId) {
    return 0;
  }
  return sumVp(
    vpTransactions,
    (transaction) =>
      transaction.memberId === memberId &&
      transaction.retailHouseId === retailHouseId &&
      transaction.qualificationMonth === yearMonth,
  );
}

export interface VpEngineResult {
  memberId: EntityId;
  organizationId: EntityId;
  yearMonth: YearMonth;
  referenceDate: ISODateString;
  transactions: VPTransaction[];
  snapshot: VPSnapshot;
  computedAt: Date;
}

/**
 * Core VP calculation — all VP derives from transactions via VP Rules.
 */
export function calculateVP(
  input: CalculateVPInput,
  rules: VpRulesConfig = DEFAULT_VP_RULES,
): VpEngineResult {
  const vpTransactions = normalizeToVpTransactions(input.transactions, rules);
  const memberTransactions = vpTransactions.filter(
    (transaction) => transaction.memberId === input.memberId,
  );

  const personal = calculateMonthlyVP(vpTransactions, input.memberId, input.yearMonth);
  const retailHouse = calculateRetailHouseVP(
    vpTransactions,
    input.memberId,
    input.retailHouseKey ?? null,
    input.yearMonth,
  );
  const organization = calculateOrganizationVP(
    vpTransactions,
    input.memberId,
    input.members,
    input.yearMonth,
  );
  const monthly = personal;
  const rolling = calculateRollingVP(
    vpTransactions,
    input.memberId,
    input.yearMonth,
    rules.rollingWindowMonths,
  );
  const qualification = calculateQualificationVP(
    vpTransactions,
    input.memberId,
    input.members,
    input.yearMonth,
  );
  const lifetime = calculateLifetimeVP(vpTransactions, input.memberId);

  const snapshot: VPSnapshot = {
    memberId: input.memberId,
    organizationId: input.organizationId,
    yearMonth: input.yearMonth,
    referenceDate: input.referenceDate,
    retailHouseId: input.retailHouseKey ?? null,
    transactionCount: memberTransactions.length,
    isCache: true,
    computedAt: new Date().toISOString(),
    buckets: {
      personal: buildBalance("personal", personal, null, rules),
      retail_house: buildBalance("retail_house", retailHouse, null, rules),
      organization: buildBalance(
        "organization",
        organization,
        null,
        rules,
      ),
      monthly: buildBalance("monthly", monthly, null, rules),
      rolling: buildBalance(
        "rolling",
        rolling ?? 0,
        null,
        rules,
      ),
      qualification: buildBalance(
        "qualification",
        qualification.personal,
        null,
        rules,
      ),
      lifetime: buildBalance("lifetime", lifetime, null, rules),
    },
  };

  if (rolling === null) {
    snapshot.buckets.rolling.isRuleMissing = true;
  }

  return {
    memberId: input.memberId,
    organizationId: input.organizationId,
    yearMonth: input.yearMonth,
    referenceDate: input.referenceDate,
    transactions: vpTransactions,
    snapshot,
    computedAt: new Date(),
  };
}

/** Monthly VP history for consecutive-month qualification — from transactions only. */
export function buildVpMonthlyHistory(
  vpTransactions: VPTransaction[],
  memberId: EntityId,
  members: CalculateVPInput["members"],
  yearMonth: YearMonth,
  historyMonthCount: number,
): Array<{ yearMonth: YearMonth; personal: number; organization: number }> {
  const months: YearMonth[] = [];
  const [year, month] = yearMonth.split("-").map(Number);
  for (let index = 0; index < historyMonthCount; index += 1) {
    const date = new Date(year, month - 1 - index, 1);
    months.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` as YearMonth,
    );
  }

  return months.map((ym) => {
    const { personal, organization } = calculateQualificationVP(
      vpTransactions,
      memberId,
      members,
      ym,
    );
    return { yearMonth: ym, personal, organization };
  });
}

export function toLegacyVpResult(
  engineResult: VpEngineResult,
): import("../types").VpResult {
  const personal = engineResult.snapshot.buckets.personal.amount;
  const byType = DEFAULT_VP_RULES.sources.map((source) => {
    const matching = engineResult.transactions.filter(
      (transaction) =>
        transaction.memberId === engineResult.memberId &&
        transaction.source === source.sourceKey &&
        isInYearMonth(transaction.date, engineResult.yearMonth),
    );
    return {
      transactionTypeKey: source.transactionTypeKey,
      count: matching.length,
      totalVp: matching.reduce((sum, transaction) => sum + transaction.vp, 0),
    };
  });

  return {
    memberId: engineResult.memberId,
    yearMonth: engineResult.yearMonth,
    totalVp: personal,
    byType,
  };
}
