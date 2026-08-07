"use client";

import {
  formatLearningStuckPoints,
  groupLearningResources,
} from "@/lib/learning-resources/catalog";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import Link from "next/link";

function ResourceCard({
  title,
  youtubeUrl,
  tags,
  note,
}: {
  title: string;
  youtubeUrl: string;
  tags: string[];
  note?: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
      <a
        className="block transition-opacity active:opacity-80"
        href={youtubeUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <p className="text-[1.0625rem] font-semibold leading-snug text-[#1d1d1f]">▶ {title}</p>
      </a>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--brand-bg)] px-2.5 py-1 text-[0.75rem] font-medium text-[#636366]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {note ? (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-[#5856d6]">{note}</p>
      ) : null}
    </article>
  );
}

export default function LearningLibraryPage() {
  const groups = groupLearningResources();
  const totalCount = groups.reduce((sum, group) => sum + group.resources.length, 0);

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f0faf3_0%,#f5faf6_48%,#e8f8ee_100%)]">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-24 pt-10 sm:max-w-2xl sm:px-6 sm:pt-12">
        <header className="space-y-2">
          <Link className="text-[0.875rem] font-medium text-[#86868b] active:opacity-70" href="/">
            ← 返回首頁
          </Link>
          <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f] sm:text-[2.125rem]">
            {APP_EMOJI.page.learning} 學習庫
          </h1>
          <p className="text-[0.9375rem] leading-relaxed text-[#86868b]">
            共 {totalCount} 支業務教學影片 · 依系列整理，點擊在 YouTube 觀看
          </p>
        </header>

        {groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{group.title}</h2>
            <div className="space-y-3">
              {group.resources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  note={resource.note}
                  tags={formatLearningStuckPoints(resource)}
                  title={resource.title}
                  youtubeUrl={resource.youtubeUrl}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
