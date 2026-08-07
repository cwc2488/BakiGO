"use client";

import {
  formatDisplayDate,
  formatPlainTimeGreeting,
  formatTimeGreeting,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Priority, PresidentAIResult } from "@/types/president-ai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_EMOJI, WORK_HUB_EMOJIS } from "@/lib/ui/app-emojis";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import {
  getHomeDisplayMode,
  setHomeDisplayMode,
  type HomeDisplayMode,
} from "@/lib/ui/home-display-mode";
import { SIMPLE_QUICK_LINKS, WORK_HUB_LINKS } from "@/lib/ui/work-hub-links";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { EmptyState, HomeErrorState, HomeLoadingSkeleton } from "./states";
import { Card, ProgressBar, SectionLabel } from "./ui";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { TodayStepCard } from "@/components/president-ai/TodayStepCard";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { TabRootShell } from "@/components/ui/TabRootShell";
import { LearningResourceSuggestions } from "@/components/learning/LearningResourceSuggestions";
import { DownlinePartnerSuggestions } from "@/components/organization/DownlinePartnerSuggestions";
import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { getCurrentMember, getCurrentSession } from "@/lib/auth/auth-service";
import { buildViewerCloudOrganizationSnapshot } from "@/lib/cloud/build-cloud-organization-tree";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { fetchDownlineCloudData } from "@/lib/cloud/downline-cloud-data";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import {
  collectDownlineRefsFromTree,
} from "@/lib/organization/collect-downline-by-depth";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";

type LoadState = "loading" | "ready" | "error";

function hasAnyActivity(metrics: MemberComputedMetrics): boolean {
  return (
    metrics.vp.totalVp > 0 ||
    metrics.retailHouse.houses.some((house) => house.transactionCount > 0) ||
    metrics.gamification.achievements.length > 0
  );
}

function HomeModeToggle({
  mode,
  onChange,
}: {
  mode: HomeDisplayMode;
  onChange: (mode: HomeDisplayMode) => void;
}) {
  return (
    <button
      className="mx-auto block text-[0.8125rem] font-medium text-[#86868b] underline-offset-2 transition-colors hover:text-[var(--brand-primary-dark)] hover:underline"
      onClick={() => onChange(mode === "simple" ? "full" : "simple")}
      type="button"
    >
      {mode === "simple" ? "顯示完整首頁" : "切換簡易首頁"}
    </button>
  );
}

function GreetingSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const referenceDate = metrics.missions.referenceDate;
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();

  return (
    <header className="home-section space-y-2 sm:space-y-3">
      <p className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-text)] sm:text-[2.125rem]">
        {formatDisplayDate(referenceDate)}
      </p>
      <Link className="block w-fit" href="/profile">
        <MemberNameWithAvatar
          avatarUrl={avatarUrl}
          name={displayName}
          nameClassName="text-[1.625rem] font-semibold leading-snug tracking-tight text-[var(--brand-text)] underline decoration-[#d1d1d6] underline-offset-4 transition-colors duration-200 hover:text-[var(--brand-primary-dark)] hover:decoration-[var(--brand-primary-dark)]/30 sm:text-[1.875rem]"
          size="lg"
          subtitle={formatTimeGreeting()}
          subtitleClassName="text-[1rem] font-medium text-[var(--brand-text-muted)] sm:text-[1.0625rem]"
          variant="hero"
        />
      </Link>
    </header>
  );
}

function QuickLinksSection({ links }: { links: readonly { href: string; title: string }[] }) {
  return (
    <section className="home-section">
      <SectionLabel>更多功能</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {links.map((link) => (
          <Link
            key={link.href}
            className="flex min-h-[4.5rem] items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 text-center transition-colors active:bg-[var(--brand-primary-muted)] hover:border-[#d1d1d6]"
            href={link.href}
          >
            <p className="text-[1rem] font-semibold text-[var(--brand-primary-dark)]">
              <span aria-hidden className="mr-1.5">
                {WORK_HUB_EMOJIS[link.href] ?? "📌"}
              </span>
              {link.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PriorityCard({ priority, index }: { priority: Priority; index: number }) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4 transition-transform duration-200 active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[0.875rem] font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">
              {priority.title}
            </p>
            <span className="shrink-0 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
              {priority.score}%
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar color="#77b539" percent={priority.score} />
          </div>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-[#86868b]">
            {priority.description}
          </p>
        </div>
      </div>
    </article>
  );
}

function PresidentAISection({
  presidentAI,
  firstUse,
}: {
  presidentAI: PresidentAIResult;
  firstUse: boolean;
}) {
  const priorities = presidentAI.topPriorities;

  return (
    <Card>
      <SectionLabel emoji={APP_EMOJI.section.presidentAi}>{PARTNER_LABELS.todaySuggestions}</SectionLabel>
      <p className="mt-1 text-[0.9375rem] text-[#86868b]">今日最重要三件事</p>
      <div className="mt-4 space-y-3">
        {priorities.length > 0 ? (
          priorities.map((priority, index) => (
            <PriorityCard key={priority.sourceKey} priority={priority} index={index} />
          ))
        ) : firstUse ? (
          <EmptyState
            emoji={APP_EMOJI.mood.welcome}
            title="歡迎使用 Baki GO"
            description="完成第一筆成交後，系統會為你排出今日最重要的三件事。"
          />
        ) : (
          <EmptyState
            emoji={APP_EMOJI.mood.done}
            title="今日沒有優先事項"
            description="所有關鍵目標都已完成，或相關設定尚待完成。"
          />
        )}
      </div>
    </Card>
  );
}

function WorkHubSection() {
  return (
    <section className="home-section grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {WORK_HUB_LINKS.map((hub) => (
        <Link
          key={hub.href}
          className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 transition-colors active:bg-[var(--brand-primary-muted)] hover:border-[#d1d1d6]"
          href={hub.href}
        >
          <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
            <span aria-hidden className="mr-1.5">
              {WORK_HUB_EMOJIS[hub.href]}
            </span>
            {hub.title}
          </p>
          <p className="mt-0.5 text-[0.75rem] text-[#86868b]">{hub.desc}</p>
        </Link>
      ))}
    </section>
  );
}

function AddTransactionButton() {
  return (
    <Link
      className="home-section flex items-center justify-between rounded-[1.75rem] bg-[#1d1d1f] px-6 py-5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.98]"
      href="/events"
    >
      <div>
        <p className="text-[1.0625rem] font-semibold">{APP_EMOJI.action.addRecord} 新增紀錄</p>
        <p className="mt-1 text-[0.875rem] text-white/70">活動、會議</p>
      </div>
      <span aria-hidden className="text-[1.375rem]">
        📝
      </span>
    </Link>
  );
}

function SimpleHomeView({
  metrics,
  onModeChange,
}: {
  metrics: MemberComputedMetrics;
  onModeChange: (mode: HomeDisplayMode) => void;
}) {
  const topPriority = metrics.presidentAI.topPriorities[0] ?? null;
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const referenceDate = metrics.missions.referenceDate;

  return (
    <>
      <GreetingHeader
        avatarUrl={avatarUrl}
        displayName={`${formatPlainTimeGreeting()}，${displayName}`}
        subtitle={formatDisplayDate(referenceDate)}
      />
      <TodayStepCard
        focusMode={metrics.presidentAI.focusMode}
        minimal
        priority={topPriority}
        showFocusMode={false}
      />
      <QuickLinksSection links={SIMPLE_QUICK_LINKS} />
      <HomeModeToggle mode="simple" onChange={onModeChange} />
    </>
  );
}

function FullHomeView({
  metrics,
  onModeChange,
}: {
  metrics: MemberComputedMetrics;
  onModeChange: (mode: HomeDisplayMode) => void;
}) {
  const firstUse = !hasAnyActivity(metrics);
  const topPriority = metrics.presidentAI.topPriorities[0] ?? null;

  return (
    <>
      <GreetingSection metrics={metrics} />
      <TodayStepCard
        focusMode={metrics.presidentAI.focusMode}
        minimal
        priority={topPriority}
        showFocusMode={false}
      />
      <DownlinePartnerSuggestions suggestions={metrics.downlinePartnerSuggestions} />
      <LearningResourceSuggestions
        pipelinePushReminders={metrics.pipelinePushReminders}
        recommendations={metrics.learningRecommendations}
      />
      <WorkHubSection />
      <PresidentAISection firstUse={firstUse} presidentAI={metrics.presidentAI} />
      <AddTransactionButton />
      <HomeModeToggle mode="full" onChange={onModeChange} />
    </>
  );
}

function HomeView({
  metrics,
  displayMode,
  onModeChange,
}: {
  metrics: MemberComputedMetrics;
  displayMode: HomeDisplayMode;
  onModeChange: (mode: HomeDisplayMode) => void;
}) {
  return (
    <TabRootShell>
      {displayMode === "simple" ? (
        <SimpleHomeView metrics={metrics} onModeChange={onModeChange} />
      ) : (
        <FullHomeView metrics={metrics} onModeChange={onModeChange} />
      )}
    </TabRootShell>
  );
}

export default function HomePage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const downlineCloudSyncedRef = useRef(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [displayMode, setDisplayMode] = useState<HomeDisplayMode>("simple");
  const [errorMessage, setErrorMessage] = useState<string>("資料載入失敗，請稍後再試。");

  const loadMetrics = useCallback(() => {
    downlineCloudSyncedRef.current = false;
    setLoadState("loading");
    setMetrics(null);
    setErrorMessage("資料載入失敗，請稍後再試。");

    try {
      setDisplayMode(getHomeDisplayMode(storage));
      const snapshot = loadMissionControlMetrics();
      setMetrics(snapshot);
      setLoadState("ready");
    } catch {
      setLoadState("error");
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, [storage]);

  const handleModeChange = useCallback(
    (mode: HomeDisplayMode) => {
      setHomeDisplayMode(mode, storage);
      setDisplayMode(mode);
    },
    [storage],
  );

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
        const members = loadAllMembers(storage);
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
    return <HomeErrorState message="找不到可用的計算結果。" onRetry={loadMetrics} />;
  }

  return (
    <HomeView displayMode={displayMode} metrics={metrics} onModeChange={handleModeChange} />
  );
}
