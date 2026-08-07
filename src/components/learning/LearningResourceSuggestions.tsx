"use client";

import type { MemberGoalActionStep } from "@/types/member-goal";
import type { LearningRecommendation } from "@/types/learning-resource";
import Link from "next/link";

function PipelinePushReminders({ steps }: { steps: MemberGoalActionStep[] }) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--brand-primary-muted)] bg-[var(--brand-bg)] p-4">
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
        名單也要推
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#636366]">
        學完記得回到名單，把這些名單推進下一階段。
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              className="block rounded-xl bg-white px-3 py-2.5 transition-colors active:bg-[var(--brand-primary-muted)]"
              href={step.href ?? "/retail-pipeline"}
            >
              <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{step.label}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[#86868b]">{step.detail}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LearningResourceSuggestions({
  recommendations,
  pipelinePushReminders = [],
  compact = false,
}: {
  recommendations: LearningRecommendation[];
  pipelinePushReminders?: MemberGoalActionStep[];
  compact?: boolean;
}) {
  if (recommendations.length === 0 && pipelinePushReminders.length === 0) {
    return null;
  }

  const primaryStuckPoint = recommendations[0]?.stuckPointLabel ?? "名單";

  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-white ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      {recommendations.length > 0 ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#5856d6]">
                建議觀看
              </p>
              <p className="mt-1 text-[0.9375rem] font-medium text-[#636366]">
                你現在卡在：<span className="text-[#1d1d1f]">{primaryStuckPoint}</span>
              </p>
            </div>
            <Link
              className="shrink-0 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
              href="/learning"
            >
              全部片單
            </Link>
          </div>

          <ul className="mt-4 space-y-3">
            {recommendations.map((item) => (
              <li key={item.resourceId}>
                <a
                  className="block rounded-2xl bg-[var(--brand-bg)] px-4 py-3 transition-colors active:bg-[var(--brand-primary-muted)]"
                  href={item.youtubeUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <p className="text-[0.9375rem] font-semibold leading-snug text-[#1d1d1f]">
                    ▶ {item.title}
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">{item.reason}</p>
                  {item.note ? (
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#5856d6]">{item.note}</p>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pipelinePushReminders.length > 0 ? (
        <PipelinePushReminders steps={pipelinePushReminders} />
      ) : null}
    </section>
  );
}
