"use client";

import { MemberAvatar } from "@/components/members/MemberAvatar";
import { PartnerListRow, PartnerStatusPill } from "@/components/partner-v2/PartnerUi";
import type { DownlinePartnerProgressRow } from "@/lib/partner-v2/downline-progress";

export function DownlinePartnerRow({ row }: { row: DownlinePartnerProgressRow }) {
  return (
    <PartnerListRow href={`/partners/${row.memberId}`}>
      <MemberAvatar avatarUrl={row.avatarUrl} name={row.displayName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[0.9375rem] font-semibold text-[var(--pv2-text-primary)]">
            {row.displayName}
          </p>
          <PartnerStatusPill status={row.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] text-[var(--pv2-text-secondary)]">
          <span>諮詢 {row.consultationLabel}</span>
          <span>量測 {row.measurementLabel}</span>
        </div>
      </div>
    </PartnerListRow>
  );
}

export function DownlinePartnersSection({
  rows,
  compact = false,
}: {
  rows: DownlinePartnerProgressRow[];
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return null;
  }

  const visibleRows = compact ? rows.slice(0, 3) : rows;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-[1rem] font-semibold text-[var(--pv2-text-primary)]">我的夥伴</h2>
        {compact && rows.length > 3 ? (
          <a
            className="text-[0.8125rem] font-semibold text-[var(--pv2-brand-primary-dark)]"
            href="/partners"
          >
            查看全部
          </a>
        ) : null}
      </div>
      <div className="space-y-2">
        {visibleRows.map((row) => (
          <DownlinePartnerRow key={row.memberId} row={row} />
        ))}
      </div>
    </section>
  );
}
