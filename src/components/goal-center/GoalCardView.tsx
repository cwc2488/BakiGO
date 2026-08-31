"use client";

import { formatJoinedDate, formatShortDate } from "@/lib/mission-control/format";
import type { GoalCard } from "@/types/goal-center";
import { Card, ProgressBar, SectionLabel } from "@/components/home/ui";

export function GoalCardView({ goal }: { goal: GoalCard }) {
  return (
    <article className="rounded-2xl border border-[var(--brand-border)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
            {goal.kpiLabel}
          </p>
          <p className="mt-1 text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">
            {goal.title}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">{goal.description}</p>
        </div>
        {goal.rewardXP > 0 ? (
          <span className="shrink-0 text-[0.8125rem] font-semibold text-[#ff375f]">
            +{goal.rewardXP} XP
          </span>
        ) : null}
      </div>

      {goal.isRuleMissing ? (
        <p className="mt-4 text-[0.875rem] text-[#86868b]">目標尚未在業務規則中定義</p>
      ) : (
        <>
          <p className="mt-4 text-[0.9375rem] font-medium text-[#1d1d1f]">
            {goal.current} / {goal.target} {goal.unit}
          </p>
          <div className="mt-3">
            <ProgressBar percent={goal.progressPercent} color="#77b539" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.8125rem]">
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">剩餘</dt>
              <dd className="mt-1 font-semibold text-[#ff375f]">
                {goal.remaining} {goal.unit}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">完成度</dt>
              <dd className="mt-1 font-semibold text-[#1d1d1f]">{goal.progressPercent}%</dd>
            </div>
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">今天需完成</dt>
              <dd className="mt-1 font-semibold text-[#1d1d1f]">
                {goal.todayNeeded !== null ? `${goal.todayNeeded} ${goal.unit}` : "—"}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">預估完成日</dt>
              <dd className="mt-1 font-semibold text-[#1d1d1f]">
                {goal.estimatedCompletionDate
                  ? formatJoinedDate(goal.estimatedCompletionDate)
                  : "—"}
              </dd>
            </div>
          </dl>
        </>
      )}
    </article>
  );
}

export function GoalCardCompact({ goal }: { goal: GoalCard }) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
            {goal.kpiLabel}
          </p>
          <p className="mt-0.5 text-[0.9375rem] font-semibold text-[#1d1d1f]">{goal.title}</p>
        </div>
        <time className="shrink-0 text-[0.8125rem] text-[#86868b]">
          {goal.estimatedCompletionDate ? formatShortDate(goal.estimatedCompletionDate) : "—"}
        </time>
      </div>
      <p className="mt-1 text-[0.875rem] text-[#86868b]">
        剩餘 {goal.remaining} {goal.unit}
        {goal.todayNeeded !== null ? ` · 今日需 ${goal.todayNeeded} ${goal.unit}` : ""}
      </p>
    </article>
  );
}

export function GoalCenterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}
