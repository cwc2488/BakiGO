"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import { getTimelineKindLabel } from "@/lib/members/workspace-selectors";
import type { MemberTimelineEntry } from "@/types/member-workspace";
import { CrmCard, CrmSectionTitle } from "../ui";

export function MemberTimelineSection({ timeline }: { timeline: MemberTimelineEntry[] }) {
  return (
    <CrmCard>
      <CrmSectionTitle>時間軸</CrmSectionTitle>
      <div className="mt-4 space-y-4">
        {timeline.length > 0 ? (
          timeline.map((entry) => (
            <article key={entry.id} className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
                    {getTimelineKindLabel(entry.kind)}
                  </p>
                  <p className="mt-0.5 text-[0.9375rem] font-semibold text-[#1d1d1f]">
                    {entry.label}
                  </p>
                </div>
                <time className="shrink-0 text-[0.8125rem] text-[#86868b]">
                  {formatShortDate(entry.eventDate)}
                </time>
              </div>
              <p className="mt-1 text-[0.875rem] text-[#86868b]">{entry.subtitle}</p>
            </article>
          ))
        ) : (
          <p className="text-[0.9375rem] text-[#86868b]">尚無活動紀錄</p>
        )}
      </div>
    </CrmCard>
  );
}
