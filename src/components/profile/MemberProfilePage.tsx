"use client";

import { getMemberProfileIdentity } from "@/lib/config/app-config";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { QuickLinkGrid } from "@/components/ui/brand-ui";
import { TabRootShell } from "@/components/ui/TabRootShell";
import {
  formatJoinedDate,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { getCurrentMember, resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { hasPartnerCareDownline } from "@/lib/auth/member-management-access";
import { buildDailyFollowUpSnapshot } from "@/lib/customers/customer-follow-up-reminder";
import { buildDailyPartnerFollowUpSnapshot } from "@/lib/members/partner-follow-up";
import { loadAllMembers } from "@/lib/members/member-service";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MetricTile,
  ProfileCard,
  ProfileSectionTitle,
  ProgressBar,
  StatRow,
} from "./ui";
import { ProfileAccountSection } from "./ProfileAccountSection";
import { ProfileAvatarSection } from "./ProfileAvatarSection";
import { ProfileHomeDisplaySection } from "./ProfileHomeDisplaySection";
import { ProfileSetupSection } from "./ProfileSetupSection";

type LoadState = "loading" | "ready" | "error";

function ProfileLoading() {
  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <div className="space-y-3">
          <div className="h-4 w-20 animate-pulse rounded-lg bg-[var(--brand-border)]" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-[var(--brand-border)]" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-[1.75rem] bg-[var(--brand-bg)]" />
        ))}
      </main>
    </div>
  );
}

function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={`flex min-h-full items-center justify-center ${PAGE_GRADIENT_CLASS} px-6`}>
      <div className="w-full max-w-sm rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          <IconLabel icon={APP_ICON.mood.error}>無法載入會員資料</IconLabel>
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#86868b]">
          系統無法完成計算，請重新載入或稍後再試。
        </p>
        <button
          className="mt-6 w-full rounded-2xl bg-[#1d1d1f] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
          onClick={onRetry}
          type="button"
        >
          重新載入
        </button>
      </div>
    </div>
  );
}

function BasicInfoSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const identity = getMemberProfileIdentity();
  const promotion = metrics.promotionProgress;

  return (
    <ProfileCard>
      <ProfileSectionTitle icon={APP_ICON.page.profile}>會員資料</ProfileSectionTitle>
      <dl className="mt-4">
        <StatRow label="姓名" value={identity.displayName} />
        <StatRow label="會員編號" value={identity.herbalifeMemberId} />
        <StatRow label="推薦人會員編號" value={identity.sponsorHerbalifeMemberId} />
        <StatRow label="目前資格" value={promotion.currentRankName || identity.qualificationLabel} />
        <StatRow
          label="加入日期"
          value={identity.joinedAt ? formatJoinedDate(identity.joinedAt) : null}
        />
        <StatRow label="狀態" value={identity.statusLabel} />
      </dl>
    </ProfileCard>
  );
}

function GrowthSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const challenge = metrics.monthlyChallenge;
  const points = metrics.gamification.points;
  const streak = metrics.gamification.streak;

  return (
    <ProfileCard>
      <ProfileSectionTitle icon={APP_ICON.section.growth}>成長資訊</ProfileSectionTitle>

      <div className="mt-4 space-y-5">
        <div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-[1rem] font-semibold text-[#1d1d1f]">{challenge.title}</p>
            <span className="text-[1rem] font-semibold text-[var(--brand-primary-dark)]">
              {challenge.overallProgressPercent}%
            </span>
          </div>
          <ProgressBar percent={challenge.overallProgressPercent} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="本月積分" value={points.monthlyPoints} />
          <MetricTile label="可兌換" value={points.availablePoints} unit="分" />
          <MetricTile label="連續天數" value={streak.currentStreak} unit="天" />
        </div>
      </div>
    </ProfileCard>
  );
}

function ProfileQuickLinks() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const viewer = getCurrentMember(storage);
  const followUpCount = useMemo(
    () => buildDailyFollowUpSnapshot(storage, resolveAuthenticatedMemberId(storage)).count,
    [storage],
  );
  const partnerFollowUpCount = useMemo(
    () => (viewer ? buildDailyPartnerFollowUpSnapshot(storage, viewer).count : 0),
    [storage, viewer],
  );
  const showPartnerCare = useMemo(() => {
    if (!viewer) {
      return false;
    }
    return hasPartnerCareDownline(viewer, loadAllMembers(storage));
  }, [storage, viewer]);

  const links = [
    {
      href: "/customers",
      label: followUpCount > 0 ? `顧客 (${followUpCount})` : "顧客",
    },
    ...(showPartnerCare
      ? [{
          href: "/members",
          label: partnerFollowUpCount > 0 ? `夥伴關懷 (${partnerFollowUpCount})` : "夥伴關懷",
        }]
      : []),
    { href: "/leaderboard", label: "排行榜" },
    { href: "/organization", label: "我的組織" },
    { href: "/retail-house", label: "零售屋" },
    { href: "/goals", label: "我的目標" },
    { href: "/calendar", label: "行事曆" },
  ] as const;

  return (
    <ProfileCard>
      <ProfileSectionTitle icon="link">更多功能</ProfileSectionTitle>
      <div className="mt-4">
        <QuickLinkGrid links={links} />
      </div>
    </ProfileCard>
  );
}

function ProfileView({
  metrics,
  onSponsorUpdated,
}: {
  metrics: MemberComputedMetrics;
  onSponsorUpdated: () => void;
}) {
  const identity = getMemberProfileIdentity();

  return (
    <TabRootShell
      header={
        <GreetingHeader
          avatarUrl={identity.avatarUrl}
          displayName={identity.displayName}
          href="/profile"
          subtitle="我的"
        />
      }
    >
        <ProfileSetupSection />
        <ProfileAvatarSection onAvatarUpdated={onSponsorUpdated} />
        <BasicInfoSection metrics={metrics} />
        <GrowthSection metrics={metrics} />
        <ProfileHomeDisplaySection />
        <ProfileQuickLinks />
        <ProfileAccountSection onSponsorUpdated={onSponsorUpdated} />
    </TabRootShell>
  );
}

export default function MemberProfilePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);

  const loadMetrics = useCallback(() => {
    setLoadState("loading");
    setMetrics(null);

    try {
      setMetrics(loadMissionControlMetrics());
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadMetrics();
    });
  }, [loadMetrics]);

  if (loadState === "loading") {
    return <ProfileLoading />;
  }

  if (loadState === "error" || !metrics) {
    return <ProfileError onRetry={loadMetrics} />;
  }

  return <ProfileView metrics={metrics} onSponsorUpdated={loadMetrics} />;
}
