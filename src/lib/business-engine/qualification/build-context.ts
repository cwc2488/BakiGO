import type { ActivityEvent } from "../types";
import type { QualificationEvaluationContext, QualificationMonthlySnapshot } from "./types";
import { countDownlineByPromotionRank } from "@/lib/mission-engine/downline";
import type { AppMember } from "@/lib/config/app-config";
import type { VPTransaction } from "@/types/vp";
import type { YearMonth } from "@/types";
import { buildVpMonthlyHistory } from "../vp";

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
    monthlySnapshots,
  };
}
