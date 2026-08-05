"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { todayISODate, toYearMonthFromDate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { buildPointsLeaderboard } from "@/lib/points/build-points-leaderboard";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { PointsHeroCard } from "@/components/points/PointsHeroCard";
import { useMemo } from "react";
import { LeaderboardRankList } from "./LeaderboardRankList";

function useLeaderboardViews(metrics: MemberComputedMetrics) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);

  return useMemo(() => {
    void metrics;
    const referenceDate = todayISODate();
    const yearMonth = toYearMonthFromDate(referenceDate);
    const viewerId = resolveAuthenticatedMemberId(storage);
    const members = loadAllMembers(storage).filter((member) => member.status === "active");
    const metricsByMemberId = new Map(
      members.map((member) => [member.id, loadMemberMetrics(member.id, storage)]),
    );

    const baseInput = {
      members,
      metricsByMemberId,
      yearMonth,
      referenceDate,
      viewerMemberId: viewerId,
    };

    return {
      weekly: buildPointsLeaderboard({ ...baseInput, period: "weekly" }),
      monthly: buildPointsLeaderboard({ ...baseInput, period: "monthly" }),
    };
  }, [metrics, storage]);
}

export function HomeLeaderboardSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const { weekly, monthly } = useLeaderboardViews(metrics);

  return (
    <section className="home-section flex flex-col gap-3">
      <PointsHeroCard metrics={metrics} viewerRank={monthly.viewerEntry?.rank ?? null} />
      <LeaderboardRankList
        displayLimit={weekly.displayLimit}
        entries={weekly.entries}
        period="weekly"
        viewerEntry={weekly.viewerEntry}
        viewerMemberId={weekly.viewerEntry?.memberId}
        weekEndDate={weekly.weekEndDate}
        weekStartDate={weekly.weekStartDate}
      />
      <LeaderboardRankList
        displayLimit={monthly.displayLimit}
        entries={monthly.entries}
        period="monthly"
        viewerEntry={monthly.viewerEntry}
        viewerMemberId={monthly.viewerEntry?.memberId}
        yearMonth={monthly.yearMonth}
      />
    </section>
  );
}

export { useLeaderboardViews };
