"use client";

import {
  formatDisplayDate,
  formatIcon,
  formatTimeGreeting,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Mission } from "@/types/mission";
import type { Priority } from "@/types/president-ai";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MapUniverseSection } from "./MapUniverseSection";
import { EmptyState, HomeErrorState, HomeLoadingSkeleton } from "./states";
import { Card, ProgressBar, SectionLabel } from "./ui";

type LoadState = "loading" | "ready" | "error";

function hasAnyActivity(metrics: MemberComputedMetrics): boolean {
  return (
    metrics.vp.totalVp > 0 ||
    metrics.retailHouse.houses.some((house) => house.transactionCount > 0) ||
    metrics.gamification.achievements.length > 0
  );
}

function GreetingSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const referenceDate = metrics.missions.referenceDate;
  const displayName = getMemberDisplayName();

  return (
    <header className="home-section space-y-2 sm:space-y-3">
      <p className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[2.125rem]">
        {formatDisplayDate(referenceDate)}
      </p>
      <h1 className="text-[1.625rem] font-semibold leading-snug tracking-tight text-[#1d1d1f] sm:text-[1.875rem]">
        {formatTimeGreeting()}，
        <Link
          className="underline decoration-[#d1d1d6] underline-offset-4 transition-colors duration-200 hover:text-[#0071e3] hover:decoration-[#0071e3]/30"
          href="/profile"
        >
          {displayName}
        </Link>
      </h1>
    </header>
  );
}

function PriorityCard({ priority, index }: { priority: Priority; index: number }) {
  return (
    <article className="rounded-2xl bg-[#f5f5f7] px-4 py-4 transition-transform duration-200 active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-[0.875rem] font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">
              {priority.title}
            </p>
            <span className="shrink-0 text-[0.8125rem] font-semibold text-[#0071e3]">
              {priority.score}%
            </span>
          </div>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
            {priority.description}
          </p>
        </div>
      </div>
    </article>
  );
}

function PresidentAISection({ metrics }: { metrics: MemberComputedMetrics }) {
  const priorities = metrics.presidentAI.topPriorities.slice(0, 3);
  const reasoning = metrics.presidentAI.reasoning[0];
  const firstUse = !hasAnyActivity(metrics);

  return (
    <Card>
      <SectionLabel>President AI</SectionLabel>
      <p className="mt-1 text-[0.9375rem] text-[#86868b]">今日最重要三件事</p>
      {reasoning ? (
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#636366]">{reasoning}</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {priorities.length > 0 ? (
          priorities.map((priority, index) => (
            <PriorityCard key={priority.sourceKey} priority={priority} index={index} />
          ))
        ) : firstUse ? (
          <EmptyState
            title="歡迎使用 Baki GO"
            description="完成第一筆成交後，President AI 會為你排出今日最重要的三件事。"
          />
        ) : (
          <EmptyState
            title="今日沒有優先事項"
            description="所有關鍵目標都已完成，或相關規則尚待設定。"
          />
        )}
      </div>
    </Card>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="rounded-2xl border border-[#ececf1] px-4 py-4 transition-transform duration-200 active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-[1.375rem] leading-none">
          {formatIcon(mission.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">
            {mission.title}
          </p>
          {mission.subtitle ? (
            <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
              {mission.subtitle}
            </p>
          ) : null}
          <p className="mt-3 text-[0.9375rem] font-medium text-[#1d1d1f]">
            {mission.current} / {mission.target}
          </p>
          <div className="mt-3">
            <ProgressBar percent={mission.progress} color={mission.color} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[0.875rem]">
            <span className="text-[#86868b]">{mission.description}</span>
            <span className="shrink-0 font-semibold text-[#ff375f]">+{mission.xp} XP</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function MissionSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const missions = metrics.missions.dailyMissionSet.missions;
  const firstUse = !hasAnyActivity(metrics);

  return (
    <Card>
      <SectionLabel>今日 Mission</SectionLabel>
      <div className="mt-4 space-y-3">
        {missions.length > 0 ? (
          missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)
        ) : firstUse ? (
          <EmptyState
            title="還沒有 Mission"
            description="記錄第一筆成交，Mission Engine 會自動產生今日任務。"
          />
        ) : (
          <EmptyState
            title="今日沒有 Mission"
            description="今天的任務已全部完成，或相關目標尚待規則定義。"
          />
        )}
      </div>
    </Card>
  );
}

function BossSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const promotion = metrics.promotionProgress;

  return (
    <Card>
      <SectionLabel>Boss Progress</SectionLabel>
      <p className="mt-1 text-[0.9375rem] text-[#86868b]">目前晉升</p>

      {promotion.isRuleMissing ? (
        <div className="mt-4">
          <EmptyState
            title="晉升條件尚未設定"
            description="Promotion Rule 定義完成後，這裡會顯示你的晉升進度。"
          />
        </div>
      ) : promotion.isMaxRank ? (
        <div className="mt-4 space-y-2">
          <p className="text-[1.375rem] font-semibold text-[#1d1d1f]">{promotion.currentRankName}</p>
          <p className="text-[0.9375rem] leading-relaxed text-[#86868b]">{promotion.description}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.875rem] text-[#86868b]">{promotion.currentRankName}</p>
              <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f] sm:text-[1.375rem]">
                {promotion.nextRankName ?? promotion.description}
              </p>
            </div>
            {promotion.progressPercent !== null ? (
              <span className="text-[0.875rem] font-semibold text-[#86868b]">
                {promotion.progressPercent}%
              </span>
            ) : null}
          </div>
          <p className="text-[0.9375rem] leading-relaxed text-[#86868b]">{promotion.description}</p>
          <ProgressBar
            percent={promotion.progressPercent}
            color={promotion.themeColor ?? "#ff375f"}
            height="h-2.5"
          />
          {promotion.target !== null && promotion.remaining !== null ? (
            <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <div className="rounded-2xl bg-[#f5f5f7] px-2 py-3 sm:px-3">
                <dt className="text-[0.75rem] text-[#86868b]">目前</dt>
                <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{promotion.current}</dd>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] px-2 py-3 sm:px-3">
                <dt className="text-[0.75rem] text-[#86868b]">目標</dt>
                <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{promotion.target}</dd>
              </div>
              <div className="rounded-2xl bg-[#f5f5f7] px-2 py-3 sm:px-3">
                <dt className="text-[0.75rem] text-[#86868b]">剩餘</dt>
                <dd className="mt-1 text-[1rem] font-semibold text-[#ff375f]">{promotion.remaining}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function TodayXpSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const referenceDate = metrics.missions.referenceDate;
  const xp = metrics.gamification.xp;
  const streak = metrics.gamification.streak;
  const todayAchievements = metrics.gamification.achievements.filter(
    (achievement) => achievement.unlockedAt === referenceDate,
  );
  const todayXp = todayAchievements.reduce(
    (sum, achievement) => sum + achievement.rewardXP,
    0,
  );
  const firstUse = !hasAnyActivity(metrics);

  return (
    <Card>
      <SectionLabel>今日 XP</SectionLabel>
      <div className="mt-4 space-y-4">
        {firstUse ? (
          <EmptyState
            title="還沒有 XP"
            description="完成 Mission 或記錄成交，今天就會開始累積 XP。"
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[2.25rem] font-semibold leading-none tracking-tight text-[#1d1d1f] sm:text-[2.5rem]">
                  +{todayXp}
                </p>
                <p className="mt-2 text-[0.9375rem] font-medium text-[#86868b]">
                  今日獲得 · 累積 {xp.totalXP} XP · {xp.levelLabel}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.8125rem] text-[#86868b]">距離下一級</p>
                <p className="mt-1 text-[1.0625rem] font-semibold text-[#0071e3] sm:text-[1.125rem]">
                  {xp.xpToNextLevel} XP
                </p>
              </div>
            </div>
            {todayXp === 0 ? (
              <p className="text-[0.875rem] text-[#86868b]">今天還沒有新的 XP，完成 Mission 即可獲得。</p>
            ) : null}
            <span className="inline-flex rounded-full bg-[#fff4e5] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]">
              {formatIcon("streak")} 連續 {streak.currentStreak} 天
              {!streak.isActiveToday && streak.currentStreak > 0 ? " · 今日尚未完成活動" : ""}
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

function TodayAchievementSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const referenceDate = metrics.missions.referenceDate;
  const todayAchievements = metrics.gamification.achievements.filter(
    (achievement) => achievement.unlockedAt === referenceDate,
  );
  const todayBadges = metrics.gamification.badges.filter(
    (badge) => badge.earnedAt === referenceDate,
  );
  const firstUse = !hasAnyActivity(metrics);
  const hasToday = todayAchievements.length > 0 || todayBadges.length > 0;

  return (
    <Card>
      <SectionLabel>今日 Achievement</SectionLabel>
      <div className="mt-4">
        {firstUse ? (
          <EmptyState
            title="還沒有成就"
            description="持續記錄成交與完成 Mission，成就會在這裡解鎖。"
          />
        ) : hasToday ? (
          <div className="flex flex-wrap gap-2">
            {todayBadges.map((badge) => (
              <span
                key={badge.badgeKey}
                className="rounded-full bg-[#f5f5f7] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon(badge.iconKey)} {badge.label}
              </span>
            ))}
            {todayAchievements.map((achievement) => (
              <span
                key={achievement.achievementKey}
                className="rounded-full bg-[#eef8ff] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon("xp")} {achievement.title}
              </span>
            ))}
          </div>
        ) : (
          <EmptyState
            title="今日還沒有新成就"
            description="完成今天的 Mission，就有機會解鎖新的 Achievement。"
          />
        )}
      </div>
    </Card>
  );
}

function AddTransactionButton() {
  return (
    <Link
      className="home-section flex items-center justify-between rounded-[1.75rem] bg-[#1d1d1f] px-6 py-5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.98]"
      href="/events"
    >
      <div>
        <p className="text-[1.0625rem] font-semibold">新增 Event</p>
        <p className="mt-1 text-[0.875rem] text-white/70">成交、活動、資格</p>
      </div>
      <span aria-hidden className="text-[1.375rem]">
        →
      </span>
    </Link>
  );
}

function HomeView({ metrics }: { metrics: MemberComputedMetrics }) {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#fafafa_0%,#f5f5f7_48%,#eef0f4_100%)]">
      <main className="home-container flex flex-col gap-5 pb-24 pt-10 sm:pt-12">
        <GreetingSection metrics={metrics} />
        <PresidentAISection metrics={metrics} />
        <MissionSection metrics={metrics} />
        <BossSection metrics={metrics} />
        <MapUniverseSection universe={metrics.mapUniverse} />
        <TodayXpSection metrics={metrics} />
        <TodayAchievementSection metrics={metrics} />
        <AddTransactionButton />
      </main>
    </div>
  );
}

export default function HomePage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>(
    "資料載入失敗，請稍後再試。",
  );

  const loadMetrics = useCallback(() => {
    setLoadState("loading");
    setMetrics(null);
    setErrorMessage("資料載入失敗，請稍後再試。");

    try {
      const snapshot = loadMissionControlMetrics();
      setMetrics(snapshot);
      setLoadState("ready");
    } catch {
      setLoadState("error");
      setErrorMessage("Engine 無法完成計算，請重新載入或稍後再試。");
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loadState === "loading") {
    return <HomeLoadingSkeleton />;
  }

  if (loadState === "error") {
    return <HomeErrorState message={errorMessage} onRetry={loadMetrics} />;
  }

  if (!metrics) {
    return (
      <HomeErrorState message="找不到可用的計算結果。" onRetry={loadMetrics} />
    );
  }

  return <HomeView metrics={metrics} />;
}
