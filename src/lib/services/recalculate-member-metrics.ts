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
import { DEFAULT_QUALIFICATION_RULES } from "@/lib/business-engine/rules/qualification";
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
import type { LearningRecommendation } from "@/types/learning-resource";
import type { PresidentAIResult } from "@/types/president-ai";
import type { RetailWeeklyReport } from "@/types/retail-weekly-report";
import type { EventCenterResult } from "@/types/event-center";
import { applyMemberStateFromEvents } from "@/lib/event-center/resolve-member-state";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { loadPointRedemptions } from "@/lib/repositories/point-redemption-repository";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { buildRetailWeeklyReport } from "./build-retail-weekly-report";
import { buildEventTimeline } from "./build-event-timeline";
import { buildMapUniverse, type MapUniverseResult } from "./build-map-universe";
import { calculatePresidentAI, toPresidentAIInput } from "@/lib/president-ai";
import { clampPercent } from "@/lib/business-engine/utils";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { BakiEvent } from "@/types/baki-event";
import { loadActiveMemberGoals } from "@/lib/member-goals/member-goal-storage";
import {
  buildCareerBlueprintView,
  buildMemberGoalProgressView,
} from "@/lib/member-goals/calculate-member-goal-progress";
import { buildRetailPipelineSnapshot } from "@/lib/retail-pipeline/pipeline-selectors";
import { buildPipelinePushSteps } from "@/lib/retail-pipeline/build-pipeline-push-steps";
import { buildRankGuidance } from "@/lib/member-goals/build-rank-guidance-playbook";
import { collectDownlinePartnerSignals } from "@/lib/organization/collect-downline-partner-signals";
import { loadAllMembers } from "@/lib/members/member-service";
import {
  detectStuckPoints,
  recommendLearningResources,
} from "@/lib/learning-resources/recommend-learning-resources";
import type { MemberGoalActionStep } from "@/types/member-goal";

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
  learningRecommendations: LearningRecommendation[];
  pipelinePushReminders: MemberGoalActionStep[];
  downlinePartnerSuggestions: import("@/types/downline-partner").DownlinePartnerSuggestion[];
}

export interface RecalculateMemberMetricsInput {
  memberId: EntityId;
  referenceDate: ISODateString;
  activities?: ActivityEvent[];
  /** Cloud-synced events for downline members viewed by an upline. */
  supplementalEvents?: BakiEvent[];
  downlineCloudCache?: import("@/lib/cloud/downline-cloud-data").DownlineCloudDataCache;
  /** 組織圖下線清單 — 與雲端 relationship 一致，優先於 sponsor 鏈。 */
  downlineRefs?: import("@/lib/organization/collect-downline-by-depth").DownlineMemberRef[];
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
  const mergedById = new Map<string, BakiEvent>();
  for (const event of eventRepository.getAll()) {
    mergedById.set(event.id, event);
  }
  for (const event of input.supplementalEvents ?? []) {
    mergedById.set(event.id, event);
  }
  const allEvents = [...mergedById.values()];
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
  const members = applyMemberStateFromEvents(getAppMembers(storage), allEvents);
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

  const qualificationResults = evaluateAllQualificationRules(
    qualificationContext,
    DEFAULT_QUALIFICATION_RULES,
    currentMember?.rankKey,
  );

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
    memberRankKey: currentMember?.rankKey,
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
    redemptions: loadPointRedemptions(storage),
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
    | "presidentAI"
    | "retailWeeklyReport"
    | "mapUniverse"
    | "eventCenter"
    | "learningRecommendations"
    | "pipelinePushReminders"
    | "downlinePartnerSuggestions"
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

  const goalMetricsContext = {
    referenceDate: input.referenceDate,
    yearMonth,
    vp,
    monthlyChallenge,
    promotionProgress,
  };
  const activeMemberGoals = loadActiveMemberGoals(storage, input.memberId, yearMonth);
  const pipelineSnapshot = buildRetailPipelineSnapshot(input.memberId, storage);
  const memberGoalViews = activeMemberGoals.map((goal) =>
    buildMemberGoalProgressView(goal, goalMetricsContext, memberTransactions, pipelineSnapshot),
  );
  const careerGoalView = buildCareerBlueprintView(goalMetricsContext, pipelineSnapshot);
  const rankGuidanceView = buildRankGuidance({
    rankKey: currentMember?.rankKey ?? RANK_KEYS.NEW_MEMBER,
    monthlyChallenge,
    qualificationResults,
    promotionProgress,
    vp,
    pipeline: pipelineSnapshot,
  });

  const stuckPointInput = {
    rankKey: currentMember?.rankKey ?? RANK_KEYS.NEW_MEMBER,
    rankGuidanceMode: rankGuidanceView?.mode ?? null,
    pipeline: pipelineSnapshot,
    qualificationResults,
    promotionProgress,
    vp,
    monthlyChallenge,
  };
  const detectedStuckPoints = detectStuckPoints(stuckPointInput);
  const pipelinePushReminders = buildPipelinePushSteps(pipelineSnapshot);

  const downlinePartnerSuggestions = collectDownlinePartnerSignals({
    viewerMemberId: input.memberId,
    viewerRankKey: currentMember?.rankKey ?? RANK_KEYS.NEW_MEMBER,
    members: loadAllMembers(storage),
    referenceDate: input.referenceDate,
    storage,
    downlineCache: input.downlineCloudCache,
    downlineRefs: input.downlineRefs,
    maxGenerations: 3,
  });

  const learningRecommendations = recommendLearningResources(stuckPointInput);

  const presidentAI = calculatePresidentAI(
    toPresidentAIInput({
      ...snapshotCore,
      referenceDate: input.referenceDate,
      memberGoals: memberGoalViews,
      careerGoal: careerGoalView,
      rankGuidance: rankGuidanceView,
      detectedStuckPoints,
      pipelinePushSteps: pipelinePushReminders,
      viewerRankKey: currentMember?.rankKey ?? RANK_KEYS.NEW_MEMBER,
      downlinePartnerSuggestions,
    }),
  );

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

  const activeSupervisorLineCount = mapUniverse.lines.filter(
    (line) => line.monthlyActive === true,
  ).length;
  const syncedMap =
    map.totalLines !== null
      ? {
          ...map,
          activeLines: activeSupervisorLineCount,
          progressPercent: clampPercent((activeSupervisorLineCount / map.totalLines) * 100),
        }
      : map;

  const eventCenter = buildEventTimeline({
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    events: allEvents,
  });

  const snapshot: MemberComputedMetrics = {
    ...snapshotCore,
    map: syncedMap,
    presidentAI,
    retailWeeklyReport,
    mapUniverse,
    eventCenter,
    learningRecommendations,
    pipelinePushReminders,
    downlinePartnerSuggestions,
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
