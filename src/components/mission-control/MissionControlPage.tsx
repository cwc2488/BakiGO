"use client";

import {
  formatDisplayDate,
  formatIcon,
  formatTimeGreeting,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import {
  hasRuleMissing,
  selectBossBattleStep,
  selectCurrentAdventureStep,
  selectDailyCoach,
  selectDailyQuote,
  selectNextAdventureStep,
  selectTodayAchievements,
  selectTodayBadges,
  shouldShowAdventureRuleMissing,
  shouldShowBossRuleMissing,
  shouldShowMissionRuleMissing,
  sumTodayXp,
} from "@/lib/mission-control/selectors";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Mission } from "@/types/mission";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RuleMissingBanner, RuleMissingBlock } from "./RuleMissingBlock";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.75rem] bg-white/85 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
      {children}
    </h2>
  );
}

function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="rounded-2xl border border-[#ececf1] px-4 py-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-[1.5rem] leading-none">
          {formatIcon(mission.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">
            {mission.title}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
            {mission.subtitle}
          </p>
          <p className="mt-3 text-[0.9375rem] font-medium text-[#1d1d1f]">
            {mission.current} / {mission.target}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ececf1]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${mission.progress}%`,
                backgroundColor: mission.color,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[0.875rem]">
            <span className="text-[#86868b]">
              {mission.description}
            </span>
            <span className="shrink-0 font-semibold text-[#ff375f]">+{mission.xp} XP</span>
          </div>
          <p className="mt-2 text-[0.8125rem] font-medium text-[#636366]">
            {mission.remaining}
          </p>
        </div>
      </div>
    </article>
  );
}

function MissionControlView({ metrics }: { metrics: MemberComputedMetrics }) {
  const referenceDate = metrics.missions.referenceDate;
  const displayName = getMemberDisplayName();
  const dailyCoach = selectDailyCoach(metrics);
  const dailyQuote = selectDailyQuote(metrics);
  const todayMissions = metrics.missions.dailyMissionSet.missions.slice(0, 3);
  const boss = selectBossBattleStep(metrics);
  const bossProgress = boss?.progressPercent ?? null;
  const todayAchievements = selectTodayAchievements(metrics, referenceDate);
  const todayBadges = selectTodayBadges(metrics, referenceDate);
  const todayXp = sumTodayXp(todayAchievements);
  const adventure = metrics.missions.adventure;
  const currentChapter = selectCurrentAdventureStep(adventure.steps);
  const nextChapter = selectNextAdventureStep(adventure.steps);
  const nextSteps = [...metrics.nextSteps].sort((left, right) => left.priority - right.priority);
  const ruleMissingCount = metrics.ruleMissing.entries.length;
  const showBossRuleMissing = shouldShowBossRuleMissing(metrics);
  const showMissionRuleMissing = shouldShowMissionRuleMissing(metrics);
  const showAdventureRuleMissing = shouldShowAdventureRuleMissing(metrics);
  const showNextStepsRuleMissing =
    nextSteps.length === 0 && hasRuleMissing(metrics, "nextSteps.");

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#fafafa_0%,#f5f5f7_48%,#eef0f4_100%)]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-20 pt-12">
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-medium tracking-wide text-[#aeaeb2]">Baki GO</p>
          <Link
            className="text-[0.8125rem] font-medium text-[#0071e3]"
            href="/retail/new"
          >
            新增成交
          </Link>
        </div>

        <header className="space-y-3 pt-2">
          <p className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
            {formatDisplayDate(referenceDate)}
          </p>
          <h1 className="text-[1.75rem] font-semibold leading-snug tracking-tight text-[#1d1d1f]">
            {formatTimeGreeting()}，{displayName} 👋
          </h1>
          <p className="text-[1.0625rem] leading-relaxed text-[#636366]">{dailyCoach}</p>
        </header>

        {ruleMissingCount > 0 ? <RuleMissingBanner entryCount={ruleMissingCount} /> : null}

        <Card>
          <SectionLabel>今日 Mission</SectionLabel>
          <div className="mt-4 space-y-3">
            {todayMissions.length > 0 ? (
              todayMissions.map((mission) => (
                <MissionCard key={mission.id} mission={mission} />
              ))
            ) : showMissionRuleMissing ? (
              <RuleMissingBlock />
            ) : (
              <p className="text-[0.9375rem] text-[#86868b]">{metrics.missions.adventure.title}</p>
            )}
          </div>
        </Card>

        {boss ? (
          <Card>
            <SectionLabel>Boss Battle</SectionLabel>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[1.375rem] font-semibold text-[#1d1d1f]">{boss.title}</p>
                <span className="text-[0.875rem] font-medium text-[#86868b]">{bossProgress}%</span>
              </div>
              <p className="text-[0.9375rem] text-[#86868b]">{boss.description}</p>
              <div className="h-4 overflow-hidden rounded-full bg-[#2c2c2e]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#ff375f] to-[#ff6482]"
                  style={{ width: `${bossProgress}%` }}
                />
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-[#f5f5f7] px-3 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">目前</dt>
                  <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{boss.current}</dd>
                </div>
                <div className="rounded-2xl bg-[#f5f5f7] px-3 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">目標</dt>
                  <dd className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">{boss.target}</dd>
                </div>
                <div className="rounded-2xl bg-[#f5f5f7] px-3 py-3">
                  <dt className="text-[0.75rem] text-[#86868b]">剩餘</dt>
                  <dd className="mt-1 text-[1rem] font-semibold text-[#ff375f]">{boss.remaining}</dd>
                </div>
              </dl>
            </div>
          </Card>
        ) : showBossRuleMissing ? (
          <Card>
            <SectionLabel>Boss Battle</SectionLabel>
            <div className="mt-4">
              <RuleMissingBlock />
            </div>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>今日成就</SectionLabel>
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="rounded-full bg-[#fff4e5] px-4 py-2 text-[0.9375rem] font-medium text-[#1d1d1f]">
              {formatIcon("streak")} Day{metrics.gamification.streak.currentStreak}
            </span>
            {todayBadges.map((badge) => (
              <span
                key={badge.badgeKey}
                className="rounded-full bg-[#f5f5f7] px-4 py-2 text-[0.9375rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon(badge.iconKey)} {badge.label}
              </span>
            ))}
            {todayAchievements.map((achievement) => (
              <span
                key={achievement.achievementKey}
                className="rounded-full bg-[#eef8ff] px-4 py-2 text-[0.9375rem] font-medium text-[#1d1d1f]"
              >
                {formatIcon("xp")} {achievement.title}
              </span>
            ))}
            <span className="rounded-full bg-[#eef8ff] px-4 py-2 text-[0.9375rem] font-semibold text-[#0071e3]">
              {formatIcon("xp")} +{todayXp} XP
            </span>
          </div>
          <p className="mt-4 text-[0.875rem] text-[#86868b]">
            {metrics.gamification.xp.levelLabel} · {metrics.gamification.xp.totalXP} XP
          </p>
        </Card>

        <Card>
          <SectionLabel>主線 Adventure</SectionLabel>
          <div className="mt-4 space-y-4">
            {showAdventureRuleMissing ? (
              <RuleMissingBlock />
            ) : (
              <>
                <div>
                  <p className="text-[0.875rem] text-[#86868b]">{adventure.title}</p>
                  <p className="mt-2 text-[1.25rem] font-semibold text-[#1d1d1f]">
                    {currentChapter?.title ?? adventure.steps[0]?.title}
                  </p>
                  <p className="mt-1 text-[0.9375rem] text-[#86868b]">
                    {currentChapter?.description ?? adventure.description}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#ececf1]">
                  <div
                    className="h-full rounded-full bg-[#30d158]"
                    style={{ width: `${adventure.overallProgress}%` }}
                  />
                </div>
                <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {adventure.overallProgress}%
                </p>
                {nextChapter ? (
                  <div className="rounded-2xl bg-[#f5f5f7] px-4 py-3">
                    <p className="text-[0.75rem] text-[#86868b]">下一個章節</p>
                    <p className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">
                      {nextChapter.title}
                    </p>
                    <p className="mt-1 text-[0.875rem] text-[#86868b]">{nextChapter.subtitle}</p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>

        {nextSteps.length > 0 ? (
          <Card>
            <SectionLabel>下一步</SectionLabel>
            <ul className="mt-4 space-y-3">
              {nextSteps.map((step) => (
                <li
                  key={step.stepKey}
                  className="flex items-start justify-between gap-4 rounded-2xl bg-[#f5f5f7] px-4 py-3"
                >
                  <div>
                    <p className="text-[1rem] font-medium text-[#1d1d1f]">{step.title}</p>
                    <p className="mt-1 text-[0.875rem] text-[#86868b]">{step.description}</p>
                  </div>
                  <span className="shrink-0 text-[0.8125rem] font-semibold text-[#ff375f]">
                    +{step.rewardXP}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : showNextStepsRuleMissing ? (
          <Card>
            <SectionLabel>下一步</SectionLabel>
            <div className="mt-4">
              <RuleMissingBlock />
            </div>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>每日一句</SectionLabel>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-[#1d1d1f]">{dailyQuote}</p>
        </Card>
      </main>
    </div>
  );
}

export default function MissionControlPage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);

  useEffect(() => {
    setMetrics(loadMissionControlMetrics());
  }, []);

  if (!metrics) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f5f5f7] text-[#86868b]">
        載入中…
      </div>
    );
  }

  return <MissionControlView metrics={metrics} />;
}
