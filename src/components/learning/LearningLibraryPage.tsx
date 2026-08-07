"use client";

import {
  formatLearningStuckPoints,
  groupLearningResources,
} from "@/lib/learning-resources/catalog";
import { PageShell } from "@/components/ui/PageShell";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";

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
    <PageShell
      subtitle={`共 ${totalCount} 支業務教學影片 · 依系列整理，點擊在 YouTube 觀看`}
      title={`${APP_EMOJI.page.learning} ${PARTNER_LABELS.learning}`}
    >
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
    </PageShell>
  );
}
