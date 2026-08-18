import { getMemberDisplayName } from "@/lib/members/member-service";
import { resolvePointsWeekRange } from "@/lib/points/week-range";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";
import {
  LEADERBOARD_DISPLAY_LIMITS,
  type LeaderboardPeriod,
  type PointsLeaderboardEntry,
  type PointsLeaderboardResult,
} from "@/types/points";

export interface BuildPointsLeaderboardInput {
  members: Member[];
  metricsByMemberId: Map<EntityId, MemberComputedMetrics>;
  yearMonth: string;
  referenceDate: string;
  viewerMemberId: EntityId;
  period: LeaderboardPeriod;
  limit?: number;
}

function scoreEntry(
  member: Member,
  metrics: MemberComputedMetrics | undefined,
  period: LeaderboardPeriod,
): Omit<PointsLeaderboardEntry, "rank"> {
  const points = metrics?.gamification.points;
  const streak = metrics?.gamification.streak;
  const monthlyPoints = points?.monthlyPoints ?? 0;
  const weeklyPoints = points?.weeklyPoints ?? 0;

  return {
    memberId: member.id,
    displayName: getMemberDisplayName(member),
    nickname: member.nickname,
    avatarUrl: member.avatarUrl ?? null,
    periodPoints: period === "monthly" ? monthlyPoints : weeklyPoints,
    monthlyPoints,
    weeklyPoints,
    lifetimePoints: points?.lifetimePoints ?? 0,
    availablePoints: points?.availablePoints ?? 0,
    streakMultiplier: points?.streakMultiplier ?? 1,
    currentStreak: streak?.currentStreak ?? 0,
  };
}

function sortEntries(entries: Omit<PointsLeaderboardEntry, "rank">[]): PointsLeaderboardEntry[] {
  const sorted = [...entries].sort((left, right) => {
    if (right.periodPoints !== left.periodPoints) {
      return right.periodPoints - left.periodPoints;
    }
    if (right.lifetimePoints !== left.lifetimePoints) {
      return right.lifetimePoints - left.lifetimePoints;
    }
    return (left.displayName ?? "").localeCompare(right.displayName ?? "", "zh-Hant");
  });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export function buildPointsLeaderboard(
  input: BuildPointsLeaderboardInput,
): PointsLeaderboardResult {
  const displayLimit = input.limit ?? LEADERBOARD_DISPLAY_LIMITS[input.period];
  const weekRange = resolvePointsWeekRange(input.referenceDate);

  const scored = sortEntries(
    input.members.map((member) =>
      scoreEntry(member, input.metricsByMemberId.get(member.id), input.period),
    ),
  );

  const entries = scored.slice(0, displayLimit);
  const viewerEntry = scored.find((entry) => entry.memberId === input.viewerMemberId) ?? null;

  return {
    period: input.period,
    yearMonth: input.yearMonth,
    weekStartDate: input.period === "weekly" ? weekRange.weekStartDate : undefined,
    weekEndDate: input.period === "weekly" ? weekRange.weekEndDate : undefined,
    referenceDate: input.referenceDate,
    entries,
    viewerRank: viewerEntry?.rank ?? null,
    viewerEntry,
    displayLimit,
  };
}

export function buildDirectDownlinePointSummaries(
  viewerId: EntityId,
  members: Member[],
  metricsByMemberId: Map<EntityId, MemberComputedMetrics>,
): PointsLeaderboardEntry[] {
  return sortEntries(
    members
      .filter((member) => member.sponsorMemberId === viewerId)
      .map((member) => scoreEntry(member, metricsByMemberId.get(member.id), "monthly")),
  );
}
