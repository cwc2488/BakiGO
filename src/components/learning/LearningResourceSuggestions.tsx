"use client";

import type { LearningRecommendation } from "@/types/learning-resource";
import Link from "next/link";

export function LearningResourceSuggestions({
  recommendations,
  compact = false,
}: {
  recommendations: LearningRecommendation[];
  compact?: boolean;
}) {
  if (recommendations.length === 0) {
    return null;
  }

  const primaryStuckPoint = recommendations[0].stuckPointLabel;

  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-white ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
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
    </section>
  );
}
