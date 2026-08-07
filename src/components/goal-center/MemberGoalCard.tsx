"use client";

import { ProgressBar } from "@/components/home/ui";
import type { MemberGoalActionStep, MemberGoalProgressView } from "@/types/member-goal";
import Link from "next/link";

function GoalActionSteps({ steps }: { steps: MemberGoalActionStep[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-[0.8125rem] font-semibold text-[#636366]">今天可以這樣做</p>
      <ul className="space-y-2">
        {steps.map((step) => {
          const content = (
            <>
              <p className="text-[0.9375rem] font-semibold leading-snug text-[#1d1d1f]">{step.label}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">{step.detail}</p>
            </>
          );

          if (step.href) {
            return (
              <li key={step.label}>
                <Link
                  className="block rounded-2xl bg-[var(--brand-bg)] px-3 py-3 transition-colors active:bg-[var(--brand-primary-muted)]"
                  href={step.href}
                >
                  {content}
                </Link>
              </li>
            );
          }

          return (
            <li key={step.label} className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              {content}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MemberGoalCard({
  goal,
  onRemove,
}: {
  goal: MemberGoalProgressView;
  onRemove?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
            我的目標
          </p>
          <p className="mt-1 text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">{goal.title}</p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">{goal.description}</p>
        </div>
        {onRemove ? (
          <button
            className="shrink-0 text-[0.8125rem] font-medium text-[#86868b]"
            onClick={onRemove}
            type="button"
          >
            移除
          </button>
        ) : null}
      </div>

      {goal.isComplete ? (
        <p className="mt-4 text-[0.9375rem] font-semibold text-[#248a3d]">已達成</p>
      ) : (
        <>
          <p className="mt-4 text-[0.9375rem] font-medium text-[#1d1d1f]">
            {goal.current.toLocaleString("zh-Hant")} / {goal.target.toLocaleString("zh-Hant")}{" "}
            {goal.unit}
          </p>
          <div className="mt-3">
            <ProgressBar color="#77b539" percent={goal.progressPercent} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.8125rem]">
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">剩餘</dt>
              <dd className="mt-1 font-semibold text-[#ff375f]">
                {goal.remaining} {goal.unit}
              </dd>
            </div>
            <div className="rounded-2xl bg-[var(--brand-bg)] px-3 py-3">
              <dt className="text-[#86868b]">今天建議</dt>
              <dd className="mt-1 font-semibold text-[#1d1d1f]">
                {goal.todayNeeded ?? "—"} {goal.unit}
              </dd>
            </div>
          </dl>
          <GoalActionSteps steps={goal.actionSteps} />
        </>
      )}
    </article>
  );
}

export function CareerGoalCard({
  title,
  description,
  current,
  target,
  remaining,
  progressPercent,
  unit,
  actionSteps,
}: {
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
  unit: string;
  actionSteps: MemberGoalActionStep[];
}) {
  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-gradient-to-br from-[#f0faf3] to-[var(--brand-surface)] px-4 py-4">
      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
        中期 · 晉升路徑
      </p>
      <p className="mt-1 text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">{title}</p>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">{description}</p>
      <p className="mt-4 text-[0.9375rem] font-medium text-[#1d1d1f]">
        {current.toLocaleString("zh-Hant")} / {target.toLocaleString("zh-Hant")} {unit}
      </p>
      <div className="mt-3">
        <ProgressBar color="#77b539" percent={progressPercent} />
      </div>
      <p className="mt-3 text-[0.8125rem] font-medium text-[#ff375f]">
        還差 {remaining} {unit}
      </p>
      <GoalActionSteps steps={actionSteps} />
    </article>
  );
}

export function UltimateGoalCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
        長期目標
      </p>
      <p className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">{title}</p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#636366]">{description}</p>
    </article>
  );
}
