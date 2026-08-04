import {
  calculateAchievementEngine,
  calculateMapProgress,
  calculateMonthlyProgress,
  calculateNextSteps,
  calculatePromotionProgress,
  calculateRetailHouse,
  calculateVP,
  toLegacyVpResult,
  type MapProgressResult,
  type NextStep,
  type PromotionProgress,
  type RetailHouseResult,
  type VpResult,
} from "@/lib/business-engine";
import {
  buildQualificationContext,
  evaluateAllQualificationRules,
  type QualificationResult,
} from "@/lib/business-engine/qualification";
import type { MissionEngineResult } from "@/types/mission";
import {
  calculateMissionEngine,
  countDownlineByPromotionRank,
} from "@/lib/mission-engine";
import type { AchievementEngineResult } from "@/types/gamification";
import type { ActivityEvent } from "@/lib/business-engine/types";
import type { MonthlyChallengeProgress } from "@/types";
import {
  APP_IDS,
  buildMonthlyChallenge,
  getAppMembers,
  getRetailHouseKeys,
  toYearMonthFromDate,
} from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  toEngineTransactions,
  toVpEngineTransactions,
} from "@/lib/repositories/retail-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { auditAllRules, createRuleMissingState } from "@/lib/rule-engine";
import { resolvePromotionQualifiedRankIds } from "@/lib/business-engine/promotion/resolve-qualified-ranks";
import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { RuleMissingState } from "@/types/rule-engine";
import type { PresidentAIResult } from "@/types/president-ai";
import type { RetailWeeklyReport } from "@/types/retail-weekly-report";
import type { EventCenterResult } from "@/types/event-center";
import { applyMemberStateFromEvents } from "@/lib/event-center/resolve-member-state";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { buildRetailWeeklyReport } from "./build-retail-weekly-report";
import { buildEventTimeline } from "./build-event-timeline";
import { buildMapUniverse, type MapUniverseResult } from "./build-map-universe";
import { calculatePresidentAI, toPresidentAIInput } from "@/lib/president-ai";

export interface MemberComputedMetrics {
  memberId: EntityId;
  yearMonth: YearMonth;
  computedAt: string;
  retailHouse: RetailHouseResult;
  monthlyChallenge: MonthlyChallengeProgress;
  vp: VpResult;
  map: MapProgressResult;
  nextSteps: NextStep[];
  qualificationResults: QualificationResult[];
  promotionProgress: PromotionProgress;
  gamification: AchievementEngineResult;
  missions: MissionEngineResult;
  ruleMissing: RuleMissingState;
  presidentAI: PresidentAIResult;
  retailWeeklyReport: RetailWeeklyReport;
  mapUniverse: MapUniverseResult;
  eventCenter: EventCenterResult;
}

export interface RecalculateMemberMetricsInput {
  memberId: EntityId;
  referenceDate: ISODateString;
  activities?: ActivityEvent[];
}

function saveComputedMetrics(
  storage: StorageAdapter,
  snapshot: MemberComputedMetrics,
): void {
  const raw = storage.getItem(STORAGE_KEYS.computedMetrics);
  let existing: MemberComputedMetrics[] = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MemberComputedMetrics[];
      if (Array.isArray(parsed)) {
        existing = parsed;
      }
    } catch {
      existing = [];
    }
  }

  const withoutCurrent = existing.filter(
    (item) => !(item.memberId === snapshot.memberId && item.yearMonth === snapshot.yearMonth),
  );

  storage.setItem(
    STORAGE_KEYS.computedMetrics,
    JSON.stringify([...withoutCurrent, snapshot]),
  );
}

export function recalculateMemberMetrics(
  input: RecalculateMemberMetricsInput,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics {
  const yearMonth = toYearMonthFromDate(input.referenceDate);
  const eventRepository = createEventRepository(storage);
  const allEvents = eventRepository.getAll();
  const projected = projectEventsForEngines(allEvents);
  const activities = input.activities ?? projected.activities;
  const allTransactions = projected.transactions;
  const memberActivities = activities.filter(
    (activity) => activity.memberId === input.memberId,
  );
  const memberTransactions = allTransactions.filter(
    (transaction) => transaction.memberId === input.memberId,
  );
  const engineTransactions = toEngineTransactions(memberTransactions);
  const members = applyMemberStateFromEvents(getAppMembers(), allEvents);
  const currentMember = members.find((member) => member.id === input.memberId);
  const retailHouseKeys = getRetailHouseKeys();
  const challenge = buildMonthlyChallenge(yearMonth);

  const vpEngineResult = calculateVP({
    memberId: input.memberId,
    organizationId: APP_IDS.organizationId,
    referenceDate: input.referenceDate,
    yearMonth,
    retailHouseKey: retailHouseKeys[0] ?? null,
    transactions: toVpEngineTransactions(memberTransactions),
    members,
  });
  const vp = toLegacyVpResult(vpEngineResult);

  const retailHouse = calculateRetailHouse({
    memberId: input.memberId,
    yearMonth,
    retailHouseKeys,
    activities: memberActivities,
    transactions: engineTransactions,
  });

  const monthlyChallenge = calculateMonthlyProgress({
    memberId: input.memberId,
    yearMonth,
    challenge,
    activities: memberActivities,
    transactions: engineTransactions,
    vpTransactions: vpEngineResult.transactions,
  });

  const map = calculateMapProgress({
    memberId: input.memberId,
    yearMonth,
    members,
    activities: memberActivities,
  });

  const qualificationContext = buildQualificationContext({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth,
    members,
    activities: memberActivities,
    vpTransactions: vpEngineResult.transactions,
    vpTotal: vpEngineResult.snapshot.buckets.qualification.amount,
    organizationVpTotal: vpEngineResult.snapshot.buckets.organization.amount,
    mapProgressPercent: map.progressPercent,
    mapTarget: map.totalLines,
    activeLines: map.activeLines,
    activeLineTarget: map.totalLines,
  });

  const qualificationResults = evaluateAllQualificationRules(qualificationContext);

  const downlinePromotionRankCounts = countDownlineByPromotionRank(members, input.memberId);
  const promotionProgress = calculatePromotionProgress({
    member: {
      id: input.memberId,
      rankKey: currentMember?.rankKey ?? "",
    },
    organization: {
      organizationId: APP_IDS.organizationId,
      members,
    },
    qualificationResults,
  });

  const promotionQualifiedRankIds = resolvePromotionQualifiedRankIds(
    currentMember?.rankKey ?? "",
    undefined,
    qualificationResults,
  );

  const { nextSteps } = calculateNextSteps({
    referenceDate: input.referenceDate,
    activities: memberActivities,
    vp,
    map,
    monthlyChallenge,
    promotionProgress,
    qualificationResults,
  });

  const gamification = calculateAchievementEngine({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth,
    currentRankKey: currentMember?.rankKey ?? "",
    activities: memberActivities,
    transactions: engineTransactions.map((transaction) => ({
      transactionDate: transaction.transactionDate,
      transactionTypeKey: transaction.transactionTypeKey ?? "",
      amount: transaction.amount,
    })),
    vpTotal: vpEngineResult.snapshot.buckets.qualification.amount,
    mapActiveLines: map.activeLines,
    monthlyChallengePercent: monthlyChallenge.overallProgressPercent,
    downlineRankCounts: downlinePromotionRankCounts,
    qualificationResults,
  });

  const missions = calculateMissionEngine({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    nextSteps,
    monthlyChallenge,
    gamification,
    promotionProgress,
    qualificationResults,
    activities: memberActivities,
    transactions: engineTransactions.map((transaction) => ({
      transactionDate: transaction.transactionDate,
      transactionTypeKey: transaction.transactionTypeKey ?? "",
      amount: transaction.amount,
    })),
    vpTotal: vpEngineResult.snapshot.buckets.qualification.amount,
    mapActiveLines: map.activeLines,
    currentRankKey: currentMember?.rankKey ?? "",
    qualifiedRankKeys: gamification.qualifiedRankKeys,
    downlineRankCounts: downlinePromotionRankCounts,
    promotionQualifiedRankIds,
  });

  const snapshotCore: Omit<
    MemberComputedMetrics,
    "presidentAI" | "retailWeeklyReport" | "mapUniverse" | "eventCenter"
  > = {
    memberId: input.memberId,
    yearMonth,
    computedAt: new Date().toISOString(),
    retailHouse,
    monthlyChallenge,
    vp,
    map,
    nextSteps,
    qualificationResults,
    promotionProgress,
    gamification,
    missions,
    ruleMissing: createRuleMissingState(auditAllRules()),
  };

  const presidentAI = calculatePresidentAI(toPresidentAIInput(snapshotCore));

  const retailWeeklyReport = buildRetailWeeklyReport({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth,
    transactions: memberTransactions,
    monthlyChallenge,
    vp,
  });

  const mapUniverse = buildMapUniverse({
    leaderMemberId: input.memberId,
    organizationId: APP_IDS.organizationId,
    referenceDate: input.referenceDate,
    yearMonth,
    map,
    members,
    activities,
    transactions: memberTransactions,
    presidentAI,
    retailHouseKey: retailHouseKeys[0] ?? null,
  });

  const eventCenter = buildEventTimeline({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    events: allEvents,
  });

  const snapshot: MemberComputedMetrics = {
    ...snapshotCore,
    presidentAI,
    retailWeeklyReport,
    mapUniverse,
    eventCenter,
  };

  saveComputedMetrics(storage, snapshot);
  return snapshot;
}

export function getLatestComputedMetrics(
  memberId: EntityId = APP_IDS.currentMemberId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics | null {
  const raw = storage.getItem(STORAGE_KEYS.computedMetrics);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as MemberComputedMetrics[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return (
      parsed
        .filter((item) => item.memberId === memberId)
        .sort((left, right) => right.computedAt.localeCompare(left.computedAt))[0] ?? null
    );
  } catch {
    return null;
  }
}
