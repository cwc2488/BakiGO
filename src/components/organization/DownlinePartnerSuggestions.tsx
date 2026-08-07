"use client";

import type { DownlinePartnerSuggestion } from "@/types/downline-partner";
import Link from "next/link";

export function DownlinePartnerSuggestions({
  suggestions,
  compact = false,
}: {
  suggestions: DownlinePartnerSuggestion[];
  compact?: boolean;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-white ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#5856d6]">
        關心下線
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">
        會議人數等於收入 · 掃描三代內夥伴
      </p>
      <ul className="mt-4 space-y-2">
        {suggestions.slice(0, 4).map((item) => (
          <li key={item.signalKey}>
            <Link
              className="block rounded-2xl bg-[var(--brand-bg)] px-4 py-3 transition-colors active:bg-[var(--brand-primary-muted)]"
              href={item.actionHref}
            >
              <p className="text-[0.9375rem] font-semibold leading-snug text-[#1d1d1f]">
                {item.title}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#86868b]">
                {item.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {suggestions.length > 4 ? (
        <Link
          className="mt-3 block text-center text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
          href="/organization"
        >
          查看全部 {suggestions.length} 位 →
        </Link>
      ) : (
        <Link
          className="mt-3 block text-center text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
          href="/organization"
        >
          組織圖 →
        </Link>
      )}
    </section>
  );
}
