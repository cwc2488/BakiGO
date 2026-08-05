"use client";

import { getMemberProfileIdentity } from "@/lib/config/app-config";
import {
  formatIcon,
  formatJoinedDate,
  formatShortDate,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import {
  selectBusinessMetrics,
  selectOrganizationCounts,
  selectProfileTimelineFromEvents,
} from "@/lib/mission-control/profile-selectors";
import {
  selectCurrentAdventureStep,
  selectNextAdventureStep,
} from "@/lib/mission-control/selectors";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Mission } from "@/types/mission";
import type { Priority } from "@/types/president-ai";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyBlock,
  MetricTile,
  ProfileCard,
  ProfileHeroTitle,
  ProfileSectionTitle,
  ProgressBar,
  StatRow,
} from "./ui";

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

function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-[1.375rem] leading-none">
          {formatIcon(mission.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{mission.title}</p>
          {mission.subtitle ? (
            <p className="mt-1 text-[0.875rem] text-[#86868b]">{mission.subtitle}</p>
          ) : null}
          <p className="mt-3 text-[0.9375rem] font-medium text-[#1d1d1f]">
            {mission.current} / {mission.target}
          </p>
          <div className="mt-3">
            <ProgressBar percent={mission.progress} color={mission.color} />
          </div>
        </div>
      </div>
    </article>
  );
}

function GrowthSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const missions = metrics.missions.dailyMissionSet.missions;
  const challenge = metrics.monthlyChallenge;
  const points = metrics.gamification.points;
  const streak = metrics.gamification.streak;
  const adventure = metrics.missions.adventure;
  const currentChapter = selectCurrentAdventureStep(adventure.steps);
  const nextChapter = selectNextAdventureStep(adventure.steps);

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji={APP_EMOJI.section.growth}>成長資訊</ProfileSectionTitle>

      <div className="mt-6 space-y-8">
        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.missions} 今日任務
          </h3>
          <div className="mt-4 space-y-3">
            {missions.length > 0 ? (
              missions.map((mission) => <MissionCard key={mission.id} mission={mission} />)
            ) : (
              <EmptyBlock
                emoji={APP_EMOJI.mood.done}
                title="今日沒有任務"
                description="系統會依你的活動自動產生今日任務。"
              />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.promotion} 本月挑戰
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <p className="text-[1.375rem] font-semibold text-[#1d1d1f]">{challenge.title}</p>
              <span className="text-[1.0625rem] font-semibold text-[var(--brand-primary-dark)]">
                {challenge.overallProgressPercent}%
              </span>
            </div>
            <ProgressBar percent={challenge.overallProgressPercent} />
            <div className="space-y-3">
              {challenge.criteria.map((criterion) => (
                <div
                  key={criterion.criterionKey}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--brand-bg)] px-4 py-3"
                >
                  <span className="text-[0.9375rem] text-[#636366]">{criterion.label}</span>
                  <span className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {criterion.currentValue}
                    {criterion.unit ? ` ${criterion.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.points} 積分
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricTile label="本月積分" value={points.monthlyPoints} />
            <MetricTile label="歷史總積分" value={points.lifetimePoints} />
            <MetricTile label="可兌換" value={points.availablePoints} unit="分" />
          </div>
          <p className="mt-4 inline-flex rounded-full bg-[#fff4e5] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]">
            {formatIcon("streak")} 連續 {streak.currentStreak} 天
            {points.streakMultiplier > 1 ? ` · 連擊 ×${points.streakMultiplier.toFixed(2)}` : ""}
          </p>
        </div>

        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.achievements} 成就
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {metrics.gamification.achievements.length > 0 ? (
              metrics.gamification.achievements.map((achievement) => (
                <span
                  key={achievement.achievementKey}
                  className="rounded-full bg-[var(--brand-primary-light)] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
                >
                  {formatIcon("xp")} {achievement.title}
                </span>
              ))
            ) : (
              <EmptyBlock
                emoji={APP_EMOJI.mood.trophy}
                title="還沒有成就"
                description="持續記錄成交與完成任務，成就會在這裡解鎖。"
              />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.mood.trophy} 徽章
          </h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {metrics.gamification.badges.length > 0 ? (
              metrics.gamification.badges.map((badge) => (
                <span
                  key={badge.badgeKey}
                  className="rounded-full bg-[var(--brand-bg)] px-4 py-2 text-[0.875rem] font-medium text-[#1d1d1f]"
                >
                  {formatIcon(badge.iconKey)} {badge.label}
                </span>
              ))
            ) : (
              <EmptyBlock
                emoji={APP_EMOJI.mood.empty}
                title="還沒有徽章"
                description="解鎖成就後，對應的徽章會顯示在這裡。"
              />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.nextSteps} 成長主線
          </h3>
          <div className="mt-4 space-y-4">
            {adventure.steps.length > 0 ? (
              <>
                <div>
                  <p className="text-[0.875rem] text-[#86868b]">{adventure.title}</p>
                  <p className="mt-2 text-[1.25rem] font-semibold text-[#1d1d1f]">
                    {currentChapter?.title ?? adventure.steps[0]?.title}
                  </p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#86868b]">
                    {currentChapter?.description ?? adventure.description}
                  </p>
                </div>
                <ProgressBar percent={adventure.overallProgress} color="#30d158" />
                <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {adventure.completedStepCount} / {adventure.totalStepCount} 章節 ·{" "}
                  {adventure.overallProgress}%
                </p>
                {nextChapter ? (
                  <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
                    <p className="text-[0.75rem] text-[#86868b]">下一個章節</p>
                    <p className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">
                      {nextChapter.title}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyBlock
                emoji={APP_EMOJI.mood.empty}
                title="成長主線尚未設定"
                description="晉升成長路徑規則定義完成後，主線進度會顯示在這裡。"
              />
            )}
          </div>
        </div>
      </div>
    </ProfileCard>
  );
}

function BusinessSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const business = selectBusinessMetrics(metrics);

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji={APP_EMOJI.section.business}>商業資訊</ProfileSectionTitle>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricTile label="本月成交" value={business.monthlyTransactions} unit="筆" />
        <MetricTile label="新顧客" value={business.newCustomer} unit="NT$" />
        <MetricTile label="舊顧客" value={business.returningCustomer} unit="NT$" />
        <MetricTile label="新會員 VP" value={business.newMemberVp} unit="VP" />
        <MetricTile label="舊會員 VP" value={business.returningMemberVp} unit="VP" />
        <MetricTile label="本月零售額" value={business.monthlyRetailAmount} unit="NT$" />
        <MetricTile label="本月 VP" value={business.monthlyVp} unit="VP" />
      </div>
    </ProfileCard>
  );
}

function OrganizationSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const counts = selectOrganizationCounts(metrics);
  const map = metrics.map;
  const universe = metrics.mapUniverse;

  return (
    <ProfileCard>
      <div className="flex items-center justify-between gap-4">
        <ProfileSectionTitle emoji={APP_EMOJI.section.organization}>組織資訊</ProfileSectionTitle>
        <Link
          className="shrink-0 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          href="/organization"
        >
          組織圖 →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="世界組數" value={counts.worldTeam} />
        <MetricTile label="推廣組數" value={counts.promotionGroup} />
        <MetricTile label="富豪組數" value={counts.wealthGroup} />
        <MetricTile label="總裁組數" value={counts.president} />
      </div>

      <div className="mt-6">
        <h3 className="text-[1.125rem] font-semibold text-[#1d1d1f]">
          {APP_EMOJI.section.mapUniverse} {universe.layoutSlotCount} 條活躍督導
        </h3>
        {universe.isRuleMissing ? (
          <div className="mt-4">
            <EmptyBlock
              emoji={APP_EMOJI.mood.empty}
              title="活躍督導目標尚未設定"
              description="系統規則定義完成後，這裡會顯示 14 條活躍督導進度。"
            />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-[0.9375rem] text-[#86868b]">
                活躍督導 {map.activeLines}
                {map.totalLines !== null ? ` / ${map.totalLines}` : ""} 條
              </p>
              {map.progressPercent !== null ? (
                <span className="text-[0.9375rem] font-semibold text-[var(--brand-primary-dark)]">
                  {map.progressPercent}%
                </span>
              ) : null}
            </div>
            {map.progressPercent !== null ? (
              <div className="mt-3">
                <ProgressBar percent={map.progressPercent} color="#30d158" />
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-7 sm:gap-4">
              {universe.lines.map((line) => (
                <div
                  key={line.lineIndex}
                  className="flex aspect-square items-center justify-center"
                  title={line.displayName ?? `活躍督導線 ${line.lineIndex + 1}`}
                >
                  <span
                    className={`block h-[85%] w-[85%] rounded-full ${
                      line.status === "growing"
                        ? "bg-[#30d158]"
                        : line.status === "needs_help"
                          ? "bg-[#ffd60a]"
                          : line.status === "danger"
                            ? "bg-[#ff375f]"
                            : "bg-[#d1d1d6]"
                    }`}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ProfileCard>
  );
}

function PriorityItem({ priority }: { priority: Priority }) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{priority.title}</p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
            {priority.description}
          </p>
        </div>
        <span className="shrink-0 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
          {priority.score}%
        </span>
      </div>
    </article>
  );
}

function PresidentAISection({ metrics }: { metrics: MemberComputedMetrics }) {
  const ai = metrics.presidentAI;

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji={APP_EMOJI.section.aiAnalysis}>AI 分析</ProfileSectionTitle>
      <div className="mt-4 space-y-6">
        <div className="rounded-2xl bg-[var(--brand-bg)] px-5 py-4">
          <p className="text-[0.8125rem] font-medium text-[#86868b]">專注模式</p>
          <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{ai.focusMode.label}</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#636366]">
            {ai.focusMode.reason}
          </p>
        </div>

        {ai.reasoning.length > 0 ? (
          <div>
            <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">分析</h3>
            <ul className="mt-3 space-y-2">
              {ai.reasoning.map((line) => (
                <li key={line} className="text-[0.9375rem] leading-relaxed text-[#636366]">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">優先事項</h3>
          <div className="mt-3 space-y-3">
            {ai.topPriorities.length > 0 ? (
              ai.topPriorities.map((priority) => (
                <PriorityItem key={priority.sourceKey} priority={priority} />
              ))
            ) : (
              <EmptyBlock
                emoji={APP_EMOJI.section.presidentAi}
                title="尚無優先事項"
                description="總裁 AI 會依系統計算結果產生建議。"
              />
            )}
          </div>
        </div>

        {ai.warnings.length > 0 ? (
          <div>
            <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">提醒</h3>
            <ul className="mt-3 space-y-2">
              {ai.warnings.map((warning) => (
                <li
                  key={warning.warningKey}
                  className="rounded-2xl bg-[#fff4e5] px-4 py-3 text-[0.9375rem] text-[#1d1d1f]"
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ai.opportunities.length > 0 ? (
          <div>
            <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">機會</h3>
            <div className="mt-3 space-y-3">
              {ai.opportunities.map((opportunity) => (
                <article
                  key={opportunity.opportunityKey}
                  className="rounded-2xl bg-[var(--brand-primary-light)] px-4 py-3"
                >
                  <p className="text-[1rem] font-semibold text-[#1d1d1f]">{opportunity.title}</p>
                  <p className="mt-1 text-[0.875rem] text-[#636366]">{opportunity.description}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ProfileCard>
  );
}

function TimelineSection({ metrics }: { metrics: MemberComputedMetrics }) {
  const events = selectProfileTimelineFromEvents(metrics);

  const categoryLabels = {
    transaction: "成交",
    activity: "活動",
    qualification: "資格",
  } as const;

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji={APP_EMOJI.section.activity}>最近活動</ProfileSectionTitle>
      <div className="mt-4">
        {events.length > 0 ? (
          <ol className="space-y-0">
            {events.map((event, index) => (
              <li
                key={event.id}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {index < events.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute left-[0.6875rem] top-6 h-[calc(100%-0.5rem)] w-px bg-[var(--brand-border)]"
                  />
                ) : null}
                <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--brand-primary)] bg-white" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--brand-bg)] px-3 py-1 text-[0.75rem] font-medium text-[#636366]">
                      {categoryLabels[event.category]}
                    </span>
                    <time className="text-[0.8125rem] text-[#86868b]">
                      {formatShortDate(event.eventDate)}
                    </time>
                  </div>
                  <p className="mt-2 text-[1rem] font-semibold text-[#1d1d1f]">{event.label}</p>
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
                    {event.subtitle}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyBlock
            emoji={APP_EMOJI.mood.empty}
            title="還沒有活動紀錄"
            description="在紀錄中心新增紀錄後，時間軸會顯示在這裡。"
          />
        )}
      </div>
    </ProfileCard>
  );
}

function ProfileView({ metrics }: { metrics: MemberComputedMetrics }) {
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
          <ProfileHeroTitle>{APP_EMOJI.page.profile} {identity.displayName}</ProfileHeroTitle>
          <p className="text-[1.0625rem] text-[#86868b]">📂 會員成長檔案</p>
        </header>

        <BasicInfoSection metrics={metrics} />
        <GrowthSection metrics={metrics} />
        <BusinessSection metrics={metrics} />
        <OrganizationSection metrics={metrics} />
        <PresidentAISection metrics={metrics} />
        <TimelineSection metrics={metrics} />
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

  return <ProfileView metrics={metrics} />;
}
