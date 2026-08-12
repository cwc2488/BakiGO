"use client";

import {
  formatDisplayDate,
  formatPlainTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Priority } from "@/types/president-ai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_ICON } from "@/lib/ui/app-icons";
import { MY_WORLD_SECONDARY_LINKS } from "@/lib/ui/work-hub-links";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { EmptyState, HomeErrorState, HomeLoadingSkeleton } from "@/components/home/states";
import { Card, ProgressBar, SectionLabel } from "@/components/home/ui";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { ROUTE_ICON_COMPONENTS, type QuickLinkHref } from "@/components/ui/BrandIcons";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { fetchDownlineCloudData } from "@/lib/cloud/downline-cloud-data";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { getMemberProfileIdentity, todayISODate } from "@/lib/config/app-config";
import { collectDownlineRefsFromTree } from "@/lib/organization/collect-downline-by-depth";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDailyActionSnapshot,
  formatDailyActionPercent,
  formatDailyActionProgress,
} from "@/lib/daily-action/daily-action-selectors";

type LoadState = "loading" | "ready" | "error";

function PriorityCard({ priority, index }: { priority: Priority; index: number }) {
  return (
    <article className="min-w-0 rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[0.875rem] font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 text-[1.0625rem] font-semibold leading-snug break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
              {priority.title}
            </p>
            <span className="shrink-0 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
              {priority.score}%
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar color="#77b539" percent={priority.score} />
          </div>
          <p className="mt-2 min-w-0 text-[0.875rem] leading-relaxed break-words text-[#86868b] [overflow-wrap:anywhere]">
            {priority.description}
          </p>
        </div>
      </div>
    </article>
  );
}

function MissionControlView({ metrics }: { metrics: MemberComputedMetrics }) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const identity = getMemberProfileIdentity();
  const referenceDate = metrics.missions.referenceDate;
  const priorities = metrics.presidentAI.topPriorities.slice(0, 3);
  const daily = useMemo(() => buildDailyActionSnapshot(metrics, storage), [metrics, storage]);
  const promotion = metrics.promotionProgress;
  const points = metrics.gamification.points;
  const completionCandidates = [
    daily.monthlyMeasurement.progressPercent,
    daily.monthlyConsultation.progressPercent,
    daily.superLeague.completionPercent,
  ].filter((value): value is number => value != null);
  const overallPercent =
    completionCandidates.length > 0
      ? Math.round(completionCandidates.reduce((sum, value) => sum + value, 0) / completionCandidates.length)
      : null;

  return (
    <>
      <GreetingHeader
        avatarUrl={avatarUrl}
        displayName={`${formatPlainTimeGreeting()}，${displayName}`}
        subtitle={formatDisplayDate(referenceDate)}
      />

      <Card>
        <SectionLabel icon={APP_ICON.page.profile}>個人位階</SectionLabel>
        <div className="mt-3 flex min-w-0 items-center gap-3">
          <MemberNameWithAvatar
            avatarUrl={avatarUrl}
            name={displayName}
            nameClassName="text-[1.125rem] font-semibold text-[#1d1d1f]"
            size="md"
            subtitle={promotion.currentRankName || identity.qualificationLabel || "資格更新中"}
            subtitleClassName="mt-0.5 text-[0.875rem] text-[#86868b]"
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={APP_ICON.page.dailyAction}>今日完成度</SectionLabel>
          <Link className="min-h-12 inline-flex items-center text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]" href="/daily-action">
            詳細行動
          </Link>
        </div>
        <p className="mt-3 text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
          {formatDailyActionPercent(overallPercent)}
        </p>
        <p className="mt-1 text-[0.875rem] text-[#86868b]">
          量測 {formatDailyActionProgress(daily.monthlyMeasurement.current, daily.monthlyMeasurement.target)}
          {" · "}
          諮詢 {formatDailyActionProgress(daily.monthlyConsultation.current, daily.monthlyConsultation.target)}
        </p>
        <div className="mt-3">
          <ProgressBar color="#77b539" percent={overallPercent ?? 0} />
        </div>
      </Card>

      <Card>
        <SectionLabel icon={APP_ICON.section.presidentAi}>今日最重要的事</SectionLabel>
        <p className="mt-1 text-[0.9375rem] text-[#86868b]">先完成這 1–3 件</p>
        <div className="mt-4 space-y-3">
          {priorities.length > 0 ? (
            priorities.map((priority, index) => (
              <PriorityCard key={priority.sourceKey} priority={priority} index={index} />
            ))
          ) : (
            <EmptyState
              icon={APP_ICON.mood.done}
              title="今天沒有緊急優先事項"
              description="可以到「顧客」陪跑需要你的人，或到「行事曆」看今日行程。"
            />
          )}
        </div>
      </Card>

      <Card>
        <SectionLabel icon={APP_ICON.section.points}>關鍵進度</SectionLabel>
        <dl className="mt-3 space-y-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <dt className="text-[0.9375rem] text-[#636366]">目前資格</dt>
            <dd className="min-w-0 text-right text-[0.9375rem] font-medium break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
              {promotion.currentRankName || identity.qualificationLabel || "—"}
            </dd>
          </div>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <dt className="text-[0.9375rem] text-[#636366]">積分</dt>
            <dd className="text-[0.9375rem] font-medium text-[#1d1d1f]">{points.availablePoints}</dd>
          </div>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <dt className="text-[0.9375rem] text-[#636366]">連續天數</dt>
            <dd className="text-[0.9375rem] font-medium text-[#1d1d1f]">{metrics.gamification.streak.currentStreak}</dd>
          </div>
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--brand-primary-muted)] px-3 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
            href="/customers"
          >
            去顧客
          </Link>
          <Link
            className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--brand-bg)] px-3 text-[0.875rem] font-semibold text-[#1d1d1f]"
            href="/calendar"
          >
            去行事曆
          </Link>
        </div>
      </Card>

      <section className="home-section">
        <SectionLabel>更多（我的）</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {MY_WORLD_SECONDARY_LINKS.map((link) => {
            const Icon = ROUTE_ICON_COMPONENTS[link.href as QuickLinkHref] ?? ROUTE_ICON_COMPONENTS["/events"];
            return (
              <Link
                key={link.href}
                className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5"
                href={link.href}
              >
                <Icon className="shrink-0 text-[var(--brand-primary)]" size={26} />
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold text-[#1d1d1f]">{link.title}</span>
                  <span className="mt-0.5 block text-[0.75rem] break-words text-[#86868b] [overflow-wrap:anywhere]">
                    {link.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

export default function HomePage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const downlineCloudSyncedRef = useRef(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("資料載入失敗，請稍後再試。");

  const loadMetrics = useCallback(() => {
    downlineCloudSyncedRef.current = false;
    setLoadState("loading");
    setMetrics(null);
    setErrorMessage("資料載入失敗，請稍後再試。");

    try {
      const snapshot = loadMissionControlMetrics();
      setMetrics(snapshot);
      setLoadState("ready");
    } catch {
      setLoadState("error");
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadMetrics();
    });
  }, [loadMetrics]);

  useEffect(() => {
    if (loadState !== "ready" || !metrics || downlineCloudSyncedRef.current) {
      return;
    }

    const viewer = getCurrentMember(storage);
    if (!viewer || !isCareerRankAtOrAbove(viewer.rankKey, RANK_KEYS.PROMOTION_GROUP)) {
      downlineCloudSyncedRef.current = true;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = getCurrentSession(storage);
        if (!session) {
          downlineCloudSyncedRef.current = true;
          return;
        }

        await syncCloudMembersToLocalStorage(storage);
        const { members: cloudMembers, relationships } = await fetchCloudOrganizationData();
        const viewerCloud = cloudMembers.find((member) => member.id === session.memberId);
        if (!viewerCloud) {
          downlineCloudSyncedRef.current = true;
          return;
        }

        const cloudSnapshot = buildViewerCloudOrganizationSnapshot({
          viewerMemberNumber: viewerCloud.memberNumber,
          members: cloudMembers,
          relationships,
          referenceDate: todayISODate(),
        });
        const downlineRefs = collectDownlineRefsFromTree(cloudSnapshot.roots[0], 3);
        const downlineIds = downlineRefs.map((item) => item.memberId);

        if (downlineIds.length === 0) {
          downlineCloudSyncedRef.current = true;
          return;
        }

        const cache = await fetchDownlineCloudData(downlineIds, viewer.id);
        if (cancelled) {
          return;
        }

        const refreshed = recalculateMemberMetrics(
          {
            memberId: viewer.id,
            referenceDate: todayISODate(),
            downlineCloudCache: cache,
            downlineRefs,
          },
          storage,
        );
        setMetrics(refreshed);
      } catch {
        // Keep local-only downline signals if cloud sync fails.
      } finally {
        downlineCloudSyncedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadState, metrics, storage]);

  if (loadState === "loading") {
    return <HomeLoadingSkeleton />;
  }

  if (loadState === "error") {
    return <HomeErrorState message={errorMessage} onRetry={loadMetrics} />;
  }

  if (!metrics) {
    return <HomeErrorState message={errorMessage} onRetry={loadMetrics} />;
  }

  return (
    <TabRootShell decorated>
      <MissionControlView metrics={metrics} />
    </TabRootShell>
  );
}
