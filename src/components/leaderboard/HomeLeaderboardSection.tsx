"use client";

import { todayISODate, toYearMonthFromDate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { loadLeaderboardBoards } from "@/lib/points/load-leaderboard-points";
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
    return loadLeaderboardBoards(storage, undefined, referenceDate, yearMonth, viewerId);
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
