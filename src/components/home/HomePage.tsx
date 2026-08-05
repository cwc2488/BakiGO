"use client";

import { buildGoalCenter } from "@/lib/goal-center/build-goal-center";
import {
  formatDisplayDate,
  formatIcon,
  formatTimeGreeting,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { GoalCenterResult } from "@/types/goal-center";
import type { Mission } from "@/types/mission";
import type { Priority } from "@/types/president-ai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoalCardCompact } from "@/components/goal-center/GoalCardView";
import { MonthlyPromotionsPanel } from "@/components/promotions/MonthlyPromotionsPanel";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { todayISODate } from "@/lib/config/app-config";
import { loadAllMembers } from "@/lib/members/member-service";
import { buildMemberMonthlyPromotions } from "@/lib/promotions/promotion-selectors";
import { loadOrganizationPromotions } from "@/lib/repositories/promotion-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_EMOJI, WORK_HUB_EMOJIS } from "@/lib/ui/app-emojis";
import { HomeLeaderboardSection } from "@/components/leaderboard/HomeLeaderboardSection";
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
          className="underline decoration-[#d1d1d6] underline-offset-4 transition-colors duration-200 hover:text-[var(--brand-primary-dark)] hover:decoration-[var(--brand-primary-dark)]/30"
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
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
            {priority.description}
          </p>
        </div>
      </div>
    </article>
  );
}

function PresidentAISection({
  goalCenter,
  firstUse,
}: {
  goalCenter: GoalCenterResult;
  firstUse: boolean;
}) {
  const priorities = goalCenter.topPriorities;
  const reasoning = goalCenter.reasoning[0];

  return (
    <Card>
      <SectionLabel emoji={APP_EMOJI.section.presidentAi}>總裁 AI</SectionLabel>
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
            emoji={APP_EMOJI.mood.welcome}
            title="歡迎使用 Baki GO"
            description="完成第一筆成交後，總裁 AI 會為你排出今日最重要的三件事。"
          />
        ) : (
          <EmptyState
            emoji={APP_EMOJI.mood.done}
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
    <article className="rounded-2xl border border-[var(--brand-border)] px-4 py-4 transition-transform duration-200 active:scale-[0.99]">
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
            <span className="shrink-0 font-semibold text-[#ff375f]">+{mission.xp} 積分</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function MissionSection({
  goalCenter,
  firstUse,
}: {
  goalCenter: GoalCenterResult;
  firstUse: boolean;
}) {
  const missions = goalCenter.dailyMissions;

  return (
    <Card>
      <SectionLabel emoji={APP_EMOJI.section.missions}>今日任務</SectionLabel>
      <div className="mt-4 space-y-3">
        {missions.length > 0 ? (
          missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)
        ) : firstUse ? (
          <EmptyState
            emoji={APP_EMOJI.mood.empty}
            title="還沒有任務"
            description="記錄第一筆成交，系統會自動產生今日任務。"
          />
        ) : (
          <EmptyState
            emoji={APP_EMOJI.mood.done}
            title="今日沒有任務"
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
      <SectionLabel emoji={APP_EMOJI.section.promotion}>晉升進度</SectionLabel>
      <p className="mt-1 text-[0.9375rem] text-[#86868b]">目前晉升</p>

      {promotion.isRuleMissing ? (
        <div className="mt-4">
          <EmptyState
            emoji={APP_EMOJI.mood.empty}
            title="晉升條件尚未設定"
            description="晉升規則定義完成後，這裡會顯示你的晉升進度。"
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
              <div className="rounded-2xl bg-[var(--brand-bg)] px-2 py-3 sm:px-3">
                <dt className="text-[0.75rem] text-[#86868b]">目前</dt>
                <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{promotion.current}</dd>
              </div>
              <div className="rounded-2xl bg-[var(--brand-bg)] px-2 py-3 sm:px-3">
                <dt className="text-[0.75rem] text-[#86868b]">目標</dt>
                <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{promotion.target}</dd>
              </div>
              <div className="rounded-2xl bg-[var(--brand-bg)] px-2 py-3 sm:px-3">
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

function TodayPointsSection({ metrics }: { metrics: MemberComputedMetrics }) {
  return <HomeLeaderboardSection metrics={metrics} />;
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
      <SectionLabel emoji={APP_EMOJI.section.achievements}>今日成就</SectionLabel>
      <div className="mt-4">
        {firstUse ? (
          <EmptyState
            emoji={APP_EMOJI.mood.trophy}
            title="還沒有成就"
            description="持續記錄成交與完成任務，成就會在這裡解鎖。"
          />
        ) : hasToday ? (
          <div className="flex flex-wrap gap-2">
            {todayBadges.map((badge) => (
              <span
                key={badge.badgeKey}
                className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon(badge.iconKey)} {badge.label}
              </span>
            ))}
            {todayAchievements.map((achievement) => (
              <span
                key={achievement.achievementKey}
                className="rounded-full bg-[var(--brand-primary-light)] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon("xp")} {achievement.title}
              </span>
            ))}
          </div>
        ) : (
          <EmptyState
            emoji={APP_EMOJI.mood.empty}
            title="今日還沒有新成就"
            description="完成今天的任務，就有機會解鎖新的成就。"
          />
        )}
      </div>
    </Card>
  );
}

function MonthlyPromotionsHomeSection() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const view = useMemo(() => {
    const viewerId = resolveAuthenticatedMemberId(storage);
    return buildMemberMonthlyPromotions({
      viewerMemberId: viewerId,
      members: loadAllMembers(storage),
      campaigns: loadOrganizationPromotions(storage),
      referenceDate: todayISODate(),
    });
  }, [storage]);

  return <MonthlyPromotionsPanel showViewAllLink variant="compact" view={view} />;
}

function WorkHubSection() {
  const hubs = [
    { href: "/daily-action", title: "今日行動", desc: "每天第一件事" },
    { href: "/retail-pipeline", title: "名單流程", desc: "推進每位名單" },
    { href: "/retail-house", title: "零售屋", desc: "週分享與成交" },
    { href: "/organization", title: "組織圖", desc: "夥伴狀況一覽" },
    { href: "/promotions", title: "促銷專欄", desc: "獎勵與挑戰" },
    { href: "/calendar", title: "行事曆", desc: "行程與 Google 同步" },
    { href: "/events", title: "紀錄中心", desc: "活動與會議" },
  ] as const;

  return (
    <section className="home-section grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {hubs.map((hub) => (
        <Link
          key={hub.href}
          className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 transition-colors active:bg-[var(--brand-primary-muted)] hover:border-[#d1d1d6]"
          href={hub.href}
        >
          <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
            <span aria-hidden className="mr-1.5">{WORK_HUB_EMOJIS[hub.href]}</span>
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

function NextStepSection({ goalCenter }: { goalCenter: GoalCenterResult }) {
  const nextSteps = goalCenter.nextSteps.slice(0, 5);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel emoji={APP_EMOJI.section.nextSteps}>下一步</SectionLabel>
        <Link className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]" href="/goals">
          目標中心 →
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {nextSteps.length > 0 ? (
          nextSteps.map((goal) => <GoalCardCompact key={goal.id} goal={goal} />)
        ) : (
          <EmptyState
            emoji={APP_EMOJI.mood.empty}
            title="尚無下一步"
            description="目標中心會依業務規則顯示距離各項 KPI 目標的差距。"
          />
        )}
      </div>
    </Card>
  );
}

function HomeView({
  metrics,
  goalCenter,
}: {
  metrics: MemberComputedMetrics;
  goalCenter: GoalCenterResult;
}) {
  const firstUse = !hasAnyActivity(metrics);

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <main className="home-container flex flex-col gap-5 pb-24 pt-10 sm:pt-12">
        <GreetingSection metrics={metrics} />
        <TodayPointsSection metrics={metrics} />
        <WorkHubSection />
        <MonthlyPromotionsHomeSection />
        <PresidentAISection goalCenter={goalCenter} firstUse={firstUse} />
        <MissionSection goalCenter={goalCenter} firstUse={firstUse} />
        <NextStepSection goalCenter={goalCenter} />
        <BossSection metrics={metrics} />
        <MapUniverseSection universe={metrics.mapUniverse} />
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
      setErrorMessage("系統無法完成計算，請重新載入或稍後再試。");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadMetrics();
    });
  }, [loadMetrics]);

  const goalCenter = useMemo(
    () => (metrics ? buildGoalCenter(metrics) : null),
    [metrics],
  );

  if (loadState === "loading") {
    return <HomeLoadingSkeleton />;
  }

  if (loadState === "error") {
    return <HomeErrorState message={errorMessage} onRetry={loadMetrics} />;
  }

  if (!metrics || !goalCenter) {
    return (
      <HomeErrorState message="找不到可用的計算結果。" onRetry={loadMetrics} />
    );
  }

  return <HomeView metrics={metrics} goalCenter={goalCenter} />;
}
