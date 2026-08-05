import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { isSupervisorRank } from "@/lib/business-engine/qualification/build-context";
import { getDirectDownline } from "@/lib/business-engine/utils";
import type { AppMember } from "@/lib/config/app-config";
import { clampPercent, criterionProgress } from "@/lib/business-engine/utils";
import type { DailyActionMetricView } from "@/types/daily-action";

function getCalendarYear(referenceDate: string): number {
  return new Date(referenceDate).getFullYear();
}

function isJoinedInCalendarYear(joinedAt: string | null | undefined, year: number): boolean {
  if (!joinedAt) {
    return false;
  }
  const joined = new Date(`${joinedAt}T12:00:00`);
  return !Number.isNaN(joined.getTime()) && joined.getFullYear() === year;
}

export function countSuperLeagueFirstGeneration(
  members: AppMember[],
  memberId: string,
  referenceDate: string,
): number {
  const year = getCalendarYear(referenceDate);
  return getDirectDownline(members, memberId).filter((member) =>
    isJoinedInCalendarYear(member.joinedAt, year),
  ).length;
}

export function countSuperLeagueSupervisors(
  members: AppMember[],
  memberId: string,
  referenceDate: string,
): number {
  const year = getCalendarYear(referenceDate);
  return getDirectDownline(members, memberId).filter(
    (member) => isJoinedInCalendarYear(member.joinedAt, year) && isSupervisorRank(member.rankKey),
  ).length;
}

export function buildSuperLeagueMetricView(
  current: number,
  target: number,
): DailyActionMetricView {
  return {
    current,
    target,
    progressPercent: criterionProgress(current, target),
    isRuleMissing: false,
  };
}

export function buildSuperLeagueMetrics(
  members: AppMember[],
  memberId: string,
  referenceDate: string,
): { firstGeneration: DailyActionMetricView; supervisor: DailyActionMetricView } {
  const rules = DEFAULT_BUSINESS_RULES.superLeague;

  return {
    firstGeneration: buildSuperLeagueMetricView(
      countSuperLeagueFirstGeneration(members, memberId, referenceDate),
      rules.firstGenerationTarget,
    ),
    supervisor: buildSuperLeagueMetricView(
      countSuperLeagueSupervisors(members, memberId, referenceDate),
      rules.supervisorTarget,
    ),
  };
}

export function calculateSuperLeagueCompletion(
  firstGeneration: DailyActionMetricView,
  supervisor: DailyActionMetricView,
): number | null {
  const segments = [firstGeneration, supervisor]
    .filter((item) => item.progressPercent !== null)
    .map((item) => ({
      progressPercent: item.progressPercent as number,
      weight: 1,
    }));

  if (segments.length === 0) {
    return null;
  }

  const totalWeight = segments.reduce((sum, item) => sum + item.weight, 0);
  const weightedSum = segments.reduce(
    (sum, item) => sum + item.progressPercent * item.weight,
    0,
  );
  return clampPercent(weightedSum / totalWeight);
}
