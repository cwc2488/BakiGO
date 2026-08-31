import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { ACTIVITY_KEYS } from "@/lib/business-engine/rules/keys";
import { criterionProgress, getDirectDownline } from "@/lib/business-engine/utils";
import type { DownlineCloudDataCache } from "@/lib/cloud/downline-cloud-data";
import { getDownlineEvents } from "@/lib/cloud/downline-cloud-data";
import {
  buildMonthlyActivityProgress,
  monthlyActivityStatusLabel,
  type MonthlyActivityStatus,
} from "@/lib/daily-action/monthly-activity-progress";
import { formatDailyActionProgress } from "@/lib/daily-action/daily-action-selectors";
import { getMemberDisplayName } from "@/lib/members/member-service";
import { buildMemberActivitySummary } from "@/lib/organization/member-activity-summary";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { EntityId, ISODateString } from "@/types";

export interface DownlinePartnerProgressRow {
  memberId: EntityId;
  displayName: string;
  avatarUrl: string | null;
  consultationCurrent: number;
  consultationTarget: number | null;
  consultationLabel: string;
  consultationProgressPercent: number | null;
  measurementCurrent: number;
  measurementTarget: number | null;
  measurementLabel: string;
  measurementProgressPercent: number | null;
  status: MonthlyActivityStatus;
  statusLabel: string;
}

function resolveActivityTarget(criterionKey: string): number | null {
  const criterion = DEFAULT_BUSINESS_RULES.monthlyChallenge.criteria.find(
    (item) => item.criterionKey === criterionKey,
  );
  return criterion?.targetValue ?? null;
}

function toMetricView(
  current: number,
  target: number | null,
): {
  current: number;
  target: number | null;
  progressPercent: number | null;
  isRuleMissing: boolean;
} {
  if (target === null) {
    return { current, target: null, progressPercent: null, isRuleMissing: true };
  }
  return { current, target, progressPercent: criterionProgress(current, target), isRuleMissing: false };
}

export function buildDownlinePartnerProgressRow(
  member: Member,
  referenceDate: ISODateString,
  storage: StorageAdapter,
  downlineCache?: DownlineCloudDataCache,
): DownlinePartnerProgressRow {
  const supplementalEvents = getDownlineEvents(member.id, downlineCache);
  const activity = buildMemberActivitySummary(
    member.id,
    referenceDate,
    storage,
    supplementalEvents,
  );

  const consultationTarget = resolveActivityTarget(ACTIVITY_KEYS.CONSULTATION);
  const measurementTarget = resolveActivityTarget(ACTIVITY_KEYS.MEASUREMENT);

  const consultation = toMetricView(activity.monthlyConsultations, consultationTarget);
  const measurement = toMetricView(activity.monthlyMeasurements, measurementTarget);

  const progress = buildMonthlyActivityProgress({
    yearMonth: referenceDate.slice(0, 7),
    monthlyConsultation: consultation,
    monthlyMeasurement: measurement,
  });

  return {
    memberId: member.id,
    displayName: getMemberDisplayName(member),
    avatarUrl: member.avatarUrl ?? null,
    consultationCurrent: consultation.current,
    consultationTarget: consultation.target,
    consultationLabel: formatDailyActionProgress(consultation.current, consultation.target),
    consultationProgressPercent: consultation.progressPercent,
    measurementCurrent: measurement.current,
    measurementTarget: measurement.target,
    measurementLabel: formatDailyActionProgress(measurement.current, measurement.target),
    measurementProgressPercent: measurement.progressPercent,
    status: progress.status,
    statusLabel: monthlyActivityStatusLabel(progress.status),
  };
}

export function buildDirectDownlineProgressRows(input: {
  viewerId: EntityId;
  members: Member[];
  referenceDate: ISODateString;
  storage: StorageAdapter;
  downlineCache?: DownlineCloudDataCache;
}): DownlinePartnerProgressRow[] {
  const directDownline = getDirectDownline(input.members, input.viewerId).filter(
    (member) => member.status === "active",
  );

  return directDownline
    .map((member) =>
      buildDownlinePartnerProgressRow(
        member,
        input.referenceDate,
        input.storage,
        input.downlineCache,
      ),
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hant"));
}

export function viewerHasDirectDownline(viewerId: EntityId, members: Member[]): boolean {
  return getDirectDownline(members, viewerId).some((member) => member.status === "active");
}
