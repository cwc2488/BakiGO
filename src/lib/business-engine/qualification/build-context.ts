import { MEETING_KEY_LIST } from "@/lib/event-center/meeting-types";
import type { ActivityEvent } from "../types";
import type { QualificationEvaluationContext, QualificationMonthlySnapshot } from "./types";
import { countDownlineByPromotionRank } from "@/lib/mission-engine/downline";
import type { AppMember } from "@/lib/config/app-config";
import type { VPTransaction } from "@/types/vp";
import type { YearMonth } from "@/types";
import { buildVpMonthlyHistory } from "../vp";
import { getDirectDownline } from "../utils";
import { resolvePromotionRankId } from "../rules/promotion";
import { PROMOTION_RANK_IDS } from "../rules/promotion";
import { resolveVpTargetAmount } from "../rules/vp";
import { VP_TARGET_KEYS } from "../rules/vp";

function countLifetimeMeetings(activities: ActivityEvent[], memberId: string): number {
  const meetingKeys = new Set<string>(MEETING_KEY_LIST);
  return activities.filter(
    (activity) =>
      activity.memberId === memberId && meetingKeys.has(activity.activityKey),
  ).length;
}
function countActivities(
  activities: ActivityEvent[],
  memberId: string,
  yearMonth: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  activities
    .filter(
      (activity) =>
        activity.memberId === memberId && activity.activityDate.startsWith(yearMonth),
    )
    .forEach((activity) => {
      counts[activity.activityKey] = (counts[activity.activityKey] ?? 0) + 1;
    });
  return counts;
}

function sumLifetimeVp(memberId: string, vpTransactions: VPTransaction[]): number {
  return vpTransactions
    .filter((transaction) => transaction.memberId === memberId)
    .reduce((sum, transaction) => sum + transaction.vp, 0);
}

function isWithinOneYearOfJoin(joinedAt: string | null | undefined, referenceDate: string): boolean {
  if (!joinedAt) {
    return false;
  }
  const joined = new Date(joinedAt);
  const reference = new Date(referenceDate);
  if (Number.isNaN(joined.getTime()) || Number.isNaN(reference.getTime())) {
    return false;
  }
  const oneYearAfterJoin = new Date(joined);
  oneYearAfterJoin.setFullYear(oneYearAfterJoin.getFullYear() + 1);
  return reference <= oneYearAfterJoin;
}

function countQualifiedRecruits(
  members: AppMember[],
  memberId: string,
  vpTransactions: VPTransaction[],
  referenceDate: string,
  qualifyingVp: number,
): number {
  const directDownline = getDirectDownline(members, memberId);
  return directDownline.filter((downlineMember) => {
    if (!isWithinOneYearOfJoin(downlineMember.joinedAt, referenceDate)) {
      return false;
    }
    return sumLifetimeVp(downlineMember.id, vpTransactions) >= qualifyingVp;
  }).length;
}

export interface BuildQualificationContextInput {
  memberId: string;
  referenceDate: string;
  yearMonth: YearMonth;
  members: AppMember[];
  activities: ActivityEvent[];
  vpTransactions: VPTransaction[];
  vpTotal: number;
  organizationVpTotal: number;
  mapProgressPercent: number | null;
  mapTarget: number | null;
  activeLines: number;
  activeLineTarget: number | null;
  /** How many past months to include for consecutive/rolling evaluation. */
  historyMonthCount?: number;
}

export function buildQualificationContext(
  input: BuildQualificationContextInput,
): QualificationEvaluationContext {
  const historyMonthCount = input.historyMonthCount ?? 6;
  const vpHistory = buildVpMonthlyHistory(
    input.vpTransactions,
    input.memberId,
    input.members,
    input.yearMonth,
    historyMonthCount,
  );

  const directDownline = getDirectDownline(input.members, input.memberId);
  const qualifyingVp =
    resolveVpTargetAmount(VP_TARGET_KEYS.DOWNLINE_QUALIFYING_LIFETIME) ?? 4000;
  const qualifiedRecruitCount = countQualifiedRecruits(
    input.members,
    input.memberId,
    input.vpTransactions,
    input.referenceDate,
    qualifyingVp,
  );

  const monthlySnapshots: QualificationMonthlySnapshot[] = vpHistory.map((entry, index) => ({
    yearMonth: entry.yearMonth,
    vp: entry.personal,
    organizationVp: entry.organization,
    mapProgressPercent: index === 0 ? input.mapProgressPercent : null,
    activeLines: index === 0 ? input.activeLines : 0,
    activityCounts: countActivities(input.activities, input.memberId, entry.yearMonth),
    downlineRankCounts: countDownlineByPromotionRank(input.members, input.memberId),
  }));

  return {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth: input.yearMonth,
    vpTotal: input.vpTotal,
    organizationVpTotal: input.organizationVpTotal,
    mapProgressPercent: input.mapProgressPercent,
    mapTarget: input.mapTarget,
    activeLines: input.activeLines,
    activeLineTarget: input.activeLineTarget,
    activityCounts: countActivities(input.activities, input.memberId, input.yearMonth),
    downlineRankCounts: countDownlineByPromotionRank(input.members, input.memberId),
    firstGenerationCount: directDownline.length,
    qualifiedRecruitCount,
    meetingCount: countLifetimeMeetings(input.activities, input.memberId),
    monthlySnapshots,
  };
}

export function isSupervisorRank(rankKey: string): boolean {
  const promotionRankId = resolvePromotionRankId(rankKey);
  if (!promotionRankId) {
    return false;
  }
  const supervisorRanks: string[] = [
    PROMOTION_RANK_IDS.SUPERVISOR,
    PROMOTION_RANK_IDS.ACTIVE_SUPERVISOR,
    PROMOTION_RANK_IDS.WORLD_TEAM,
    PROMOTION_RANK_IDS.PROMOTION_GROUP,
    PROMOTION_RANK_IDS.WEALTH_GROUP,
    PROMOTION_RANK_IDS.PRESIDENT,
  ];
  return supervisorRanks.includes(promotionRankId);
}
