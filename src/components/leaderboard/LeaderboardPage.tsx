"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { fetchDownlineCloudData, getDownlineEvents } from "@/lib/cloud/downline-cloud-data";
import type { DownlineCloudDataCache } from "@/lib/cloud/downline-cloud-data";
import { todayISODate, toYearMonthFromDate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { buildPointsLeaderboard } from "@/lib/points/build-points-leaderboard";
import { formatPointsValue } from "@/lib/points/streak-multiplier";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { AppIcon, IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import type { PointsLeaderboardResult } from "@/types/points";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LeaderboardRankList } from "./LeaderboardRankList";
import { PageShell } from "@/components/ui/PageShell";

function PointsHeroBanner({
  points,
  streak,
  yearMonth,
}: {
  points: NonNullable<PointsLeaderboardResult["viewerEntry"]>;
  streak: number;
  yearMonth: string;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#248a3d]/20 bg-[linear-gradient(135deg,#248a3d_0%,#77b539_55%,#a8d86a_100%)] p-6 text-white shadow-[0_16px_48px_rgba(36,138,61,0.25)]">
      <p className="text-[0.8125rem] font-medium text-white/80">
        <IconLabel icon={APP_ICON.mood.trophy} iconClassName="text-white/80">
          {yearMonth} 本月排行
        </IconLabel>
      </p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.875rem] font-medium text-white/85">你的本月積分</p>
          <p className="mt-1 text-[3rem] font-bold leading-none tracking-tight">
            {formatPointsValue(points.monthlyPoints)}
          </p>
          <p className="mt-2 text-[0.9375rem] text-white/85">
            第 {points.rank} 名 · 本週 {formatPointsValue(points.weeklyPoints)} 分
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.8125rem] text-white/75">可兌換</p>
          <p className="mt-1 text-[1.75rem] font-bold">{formatPointsValue(points.availablePoints)}</p>
          {points.streakMultiplier > 1 ? (
            <p className="mt-1 rounded-full bg-white/15 px-3 py-1 text-[0.8125rem] font-semibold">
              連擊 ×{points.streakMultiplier.toFixed(2)}
            </p>
          ) : null}
          {streak > 1 ? (
            <p className="mt-1 text-[0.75rem] text-white/75">連續 {streak} 天</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function GroupCompetitionPlaceholder() {
  return (
    <section className="rounded-[1.75rem] border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
        <IconLabel icon={APP_ICON.section.groupCompetition}>分組競賽</IconLabel>
      </p>
      <h2 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">即將推出</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">
        預留分組競賽窗口，之後可依團隊分組進行積分對戰。
      </p>
    </section>
  );
}

export default function LeaderboardPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downlineCache, setDownlineCache] = useState<DownlineCloudDataCache>(() => new Map());

  useEffect(() => {
    void (async () => {
      const viewerId = resolveAuthenticatedMemberId(storage);
      const members = loadAllMembers(storage).filter((member) => member.status === "active");
      const cache = await fetchDownlineCloudData(
        members.map((member) => member.id),
        viewerId,
      );
      setDownlineCache(cache);
      setRefreshKey((current) => current + 1);
    })();
  }, [storage]);

  const { weekly, monthly, viewerMetrics } = useMemo(() => {
    void refreshKey;
    const referenceDate = todayISODate();
    const yearMonth = toYearMonthFromDate(referenceDate);
    const viewerId = resolveAuthenticatedMemberId(storage);
    const members = loadAllMembers(storage).filter((member) => member.status === "active");
    const metricsByMemberId = new Map(
      members.map((member) => [
        member.id,
        loadMemberMetrics(member.id, storage, getDownlineEvents(member.id, downlineCache)),
      ]),
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
      viewerMetrics: loadMemberMetrics(viewerId, storage),
    };
  }, [downlineCache, refreshKey, storage]);

  const reload = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    queueMicrotask(reload);
  }, [reload]);

  return (
    <PageShell
      subtitle="本週前五 · 本月前十 · 歷史總積分永久保留"
      title="排行榜"
      titleIcon={APP_ICON.mood.trophy}
    >
        {monthly.viewerEntry ? (
          <PointsHeroBanner
            points={monthly.viewerEntry}
            streak={viewerMetrics.gamification.streak.currentStreak}
            yearMonth={monthly.yearMonth}
          />
        ) : null}

        <Link
          className="flex items-center justify-between rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-5 py-4 transition-colors active:bg-[var(--brand-primary-muted)]"
          href="/organization"
        >
          <div>
            <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
              <IconLabel icon={APP_ICON.action.redeem}>為下線兌換積分</IconLabel>
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">
              組織圖選取下線 · 支援所有世代
            </p>
          </div>
          <span aria-hidden className="text-[1.125rem] text-[var(--brand-primary-dark)]">
            →
          </span>
        </Link>

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
          organizationLink
          period="monthly"
          viewerEntry={monthly.viewerEntry}
          viewerMemberId={monthly.viewerEntry?.memberId}
          yearMonth={monthly.yearMonth}
        />

        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">
            <IconLabel icon={APP_ICON.section.points}>積分規則</IconLabel>
          </h2>
          <ul className="mt-3 space-y-2 text-[0.875rem] text-[#636366]">
            <li>
              <IconLabel icon={APP_ICON.action.measurement}>量測 1 分</IconLabel>
              {" · "}
              <IconLabel icon={APP_ICON.action.consultation}>諮詢 5 分</IconLabel>
            </li>
            <li>
              <IconLabel icon={APP_ICON.quadrant.newCustomer}>新顧客成交 20 分</IconLabel>
              {" · "}
              <IconLabel icon={APP_ICON.quadrant.returningCustomer}>舊顧客續訂 25 分</IconLabel>
            </li>
            <li>
              <IconLabel icon={APP_ICON.quadrant.newMember}>新會員 25 分</IconLabel>
              {" · "}
              <IconLabel icon={APP_ICON.quadrant.returningMember}>舊會員 25 分</IconLabel>
            </li>
            <li>
              <IconLabel icon={APP_ICON.mood.streak}>連續每日積分：每天 +2% 加成，上限 20%</IconLabel>
            </li>
          </ul>
        </section>

        <GroupCompetitionPlaceholder />
    </PageShell>
  );
}
