"use client";

import { getMemberProfileIdentity } from "@/lib/config/app-config";
import {
  formatJoinedDate,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MetricTile,
  ProfileCard,
  ProfileSectionTitle,
  ProgressBar,
  StatRow,
} from "./ui";
import { ProfileAccountSection } from "./ProfileAccountSection";
import { ProfileAvatarSection } from "./ProfileAvatarSection";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";

type LoadState = "loading" | "ready" | "error";

function ProfileLoading() {
  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
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
    <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] px-6">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.mood.error} 無法載入會員資料
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#86868b]">
          系統無法完成計算，請重新載入或稍後再試。
        </p>
        <button
          className="mt-6 w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
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
      <ProfileSectionTitle emoji={APP_EMOJI.page.profile}>會員資料</ProfileSectionTitle>
      <dl className="mt-4">
        <StatRow
          label="姓名"
          value={
            <MemberNameWithAvatar
              avatarUrl={identity.avatarUrl}
              name={identity.displayName}
              nameClassName="text-[1rem] font-medium text-[#1d1d1f]"
              size="sm"
            />
          }
        />
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
      <ProfileSectionTitle emoji={APP_EMOJI.section.growth}>成長資訊</ProfileSectionTitle>

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
  const links = [
    { href: "/leaderboard", label: "積分排行", emoji: "🏆" },
    { href: "/organization", label: "組織圖", emoji: "🌳" },
    { href: "/retail-house", label: "零售屋", emoji: "🏠" },
    { href: "/goals", label: "目標中心", emoji: "🎯" },
    { href: "/events", label: "活動紀錄", emoji: "📋" },
  ] as const;

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji="🔗">更多功能</ProfileSectionTitle>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            className="rounded-xl bg-[var(--brand-bg)] px-4 py-3 text-[0.9375rem] font-medium text-[#1d1d1f] transition-colors hover:bg-[var(--brand-primary-muted)]"
            href={link.href}
          >
            {link.emoji} {link.label}
          </Link>
        ))}
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
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <Link
            className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)] transition-opacity duration-200 hover:opacity-70"
            href="/"
          >
            ← 返回首頁
          </Link>
          <MemberNameWithAvatar
            avatarUrl={identity.avatarUrl}
            name={`${APP_EMOJI.page.profile} ${identity.displayName}`}
            nameClassName="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[2.25rem]"
            size="lg"
          />
        </header>

        <ProfileAvatarSection onAvatarUpdated={onSponsorUpdated} />
        <BasicInfoSection metrics={metrics} />
        <GrowthSection metrics={metrics} />
        <ProfileAccountSection onSponsorUpdated={onSponsorUpdated} />
        <ProfileQuickLinks />
      </main>
    </div>
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
