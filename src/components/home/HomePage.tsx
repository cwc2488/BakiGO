"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDisplayDate,
  formatPlainTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
  readMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { HomeErrorState, HomeLoadingSkeleton } from "@/components/home/states";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { buildDailyActionSnapshot } from "@/lib/daily-action/daily-action-selectors";
import { buildMonthlyActivityProgress } from "@/lib/daily-action/monthly-activity-progress";
import { MonthlyActionHero } from "@/components/partner-v2/MonthlyActionHero";
import { DownlinePartnersSection } from "@/components/partner-v2/DownlinePartnersSection";
import { PartnerSecondaryShortcuts } from "@/components/partner-v2/PartnerSecondaryShortcuts";
import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import { loadAllMembers } from "@/lib/members/member-service";
import {
  buildDirectDownlineProgressRows,
  viewerHasDirectDownline,
} from "@/lib/partner-v2/downline-progress";
import {
  collectMemberIdsFromTree,
  fetchDownlineCloudData,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";

type LoadState = "loading" | "ready" | "error";

function PartnerHomeView({
  metrics,
  onMetricsUpdated,
}: {
  metrics: MemberComputedMetrics;
  onMetricsUpdated: (next: MemberComputedMetrics) => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const referenceDate = metrics.missions.referenceDate;

  const daily = useMemo(() => buildDailyActionSnapshot(metrics, storage), [metrics, storage]);
  const monthlyProgress = useMemo(
    () =>
      buildMonthlyActivityProgress({
        yearMonth: daily.yearMonth,
        monthlyConsultation: daily.monthlyConsultation,
        monthlyMeasurement: daily.monthlyMeasurement,
      }),
    [daily],
  );

  const viewer = useMemo(() => getCurrentMember(storage), [storage]);
  const allMembers = useMemo(() => loadAllMembers(storage), [storage]);
  const hasDownline = useMemo(
    () => (viewer ? viewerHasDirectDownline(viewer.id, allMembers) : false),
    [viewer, allMembers],
  );

  const [downlineRows, setDownlineRows] = useState<
    ReturnType<typeof buildDirectDownlineProgressRows>
  >([]);
  const [downlineLoading, setDownlineLoading] = useState(hasDownline);

  useEffect(() => {
    if (!viewer || !hasDownline) {
      setDownlineLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDownlineProgress() {
      setDownlineLoading(true);
      try {
        await syncCloudMembersToLocalStorage(storage);
        const members = loadAllMembers(storage);
        let downlineCache: DownlineCloudDataCache = new Map();

        try {
          const session = getCurrentSession(storage);
          if (!session) return;

          const { members: cloudMembers, relationships } = await fetchCloudOrganizationData();
          const viewerCloud = cloudMembers.find((member) => member.id === viewer!.id);
          if (!viewerCloud) return;

          const cloudSnapshot = buildViewerCloudOrganizationSnapshot({
            viewerMemberNumber: viewerCloud.memberNumber,
            members: cloudMembers,
            relationships,
            referenceDate,
          });

          const downlineIds = cloudSnapshot.roots.flatMap((root) =>
            collectMemberIdsFromTree(root),
          );
          downlineCache = await fetchDownlineCloudData(downlineIds, session.memberId);
        } catch {
          // Cloud optional — fall back to local events only.
        }

        if (cancelled) return;

        setDownlineRows(
          buildDirectDownlineProgressRows({
            viewerId: viewer!.id,
            members,
            referenceDate,
            storage,
            downlineCache,
          }),
        );
      } finally {
        if (!cancelled) {
          setDownlineLoading(false);
        }
      }
    }

    void loadDownlineProgress();
    return () => {
      cancelled = true;
    };
  }, [viewer, hasDownline, referenceDate, storage]);

  return (
    <>
      <GreetingHeader
        avatarUrl={avatarUrl}
        displayName={`${formatPlainTimeGreeting()}，${displayName}`}
        subtitle={formatDisplayDate(referenceDate)}
      />

      <MonthlyActionHero progress={monthlyProgress} onMetricsUpdated={onMetricsUpdated} />

      {hasDownline ? (
        downlineLoading ? (
          <div className="h-28 animate-pulse rounded-[var(--pv2-radius-lg)] bg-[var(--pv2-surface-elevated)]" />
        ) : (
          <DownlinePartnersSection compact rows={downlineRows} />
        )
      ) : null}

      <PartnerSecondaryShortcuts />

      <section className="pb-2">
        <Link
          className="flex min-h-11 items-center justify-between rounded-[var(--pv2-radius-md)] border border-[var(--pv2-border-subtle)] bg-[var(--pv2-surface)] px-4 text-[0.9375rem] font-semibold text-[var(--pv2-text-primary)]"
          href="/retail-house"
        >
          <span>我的零售屋</span>
          <span aria-hidden className="text-[var(--pv2-text-muted)]">
            →
          </span>
        </Link>
      </section>
    </>
  );
}

export default function HomePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState("資料載入失敗，請稍後再試。");

  const softRecalc = useCallback(() => {
    try {
      const snapshot = loadMissionControlMetrics(undefined, createLocalStorageAdapter(), undefined, {
        includeMapUniverse: false,
      });
      setMetrics(snapshot);
      setLoadState("ready");
    } catch {
      setLoadState((prev) => (prev === "ready" ? "ready" : "error"));
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, []);

  const bootstrap = useCallback(() => {
    setErrorMessage("資料載入失敗，請稍後再試。");
    try {
      const cached = readMissionControlMetrics();
      if (cached) {
        setMetrics(cached);
        setLoadState("ready");
        queueMicrotask(() => softRecalc());
        return;
      }
      setLoadState("loading");
      softRecalc();
    } catch {
      setLoadState("error");
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, [softRecalc]);

  useEffect(() => {
    queueMicrotask(() => {
      bootstrap();
    });
  }, [bootstrap]);

  if (loadState === "loading" && !metrics) {
    return <HomeLoadingSkeleton />;
  }

  if (loadState === "error" && !metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  if (!metrics) {
    return <HomeErrorState message={errorMessage} onRetry={bootstrap} />;
  }

  return (
    <TabRootShell decorated>
      <PartnerHomeView metrics={metrics} onMetricsUpdated={setMetrics} />
    </TabRootShell>
  );
}
