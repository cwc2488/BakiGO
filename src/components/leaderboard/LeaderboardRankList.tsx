"use client";

import { formatPointsValue } from "@/lib/points/streak-multiplier";
import { formatReportDateRange } from "@/lib/retail-house/format-report";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import type { EntityId } from "@/types";
import type { LeaderboardPeriod, PointsLeaderboardEntry } from "@/types/points";
import Link from "next/link";
import { LeaderboardRankBadge } from "./LeaderboardRankBadge";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  weekly: "本週前五",
  monthly: "本月前十",
};

export function LeaderboardRankList({
  period,
  entries,
  viewerMemberId,
  viewerEntry,
  yearMonth,
  weekStartDate,
  weekEndDate,
  displayLimit,
  compact = false,
  organizationLink = false,
}: {
  period: LeaderboardPeriod;
  entries: PointsLeaderboardEntry[];
  viewerMemberId?: EntityId | null;
  viewerEntry?: PointsLeaderboardEntry | null;
  yearMonth?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  displayLimit: number;
  compact?: boolean;
  organizationLink?: boolean;
}) {
  const viewerInList = entries.some((entry) => entry.memberId === viewerMemberId);
  const extraViewerEntry =
    viewerEntry && !viewerInList && viewerMemberId === viewerEntry.memberId
      ? viewerEntry
      : null;

  const subtitle =
    period === "weekly" && weekStartDate && weekEndDate
      ? formatReportDateRange(weekStartDate, weekEndDate)
      : yearMonth;

  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.mood.trophy} {PERIOD_LABELS[period]}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">{subtitle}</p>
          ) : null}
        </div>
        {organizationLink && period === "monthly" ? (
          <Link
            className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
            href="/organization"
          >
            下線積分 →
          </Link>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ul className={`space-y-2 ${compact ? "mt-3" : "mt-4"}`}>
          {entries.map((entry) => (
            <LeaderboardRankRow
              key={entry.memberId}
              entry={entry}
              highlight={entry.memberId === viewerMemberId}
            />
          ))}
          {extraViewerEntry ? (
            <>
              <li aria-hidden className="py-1 text-center text-[0.75rem] text-[#86868b]">
                ···
              </li>
              <LeaderboardRankRow entry={extraViewerEntry} highlight />
            </>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 text-center text-[0.875rem] text-[#86868b]">
          {APP_EMOJI.mood.empty} {period === "weekly" ? "本週" : "本月"}尚無積分紀錄
        </p>
      )}

      <p className="mt-3 text-center text-[0.75rem] text-[#aeaeb2]">
        顯示前 {displayLimit} 名
        {extraViewerEntry ? " · 含你的排名" : ""}
      </p>
    </section>
  );
}

function LeaderboardRankRow({
  entry,
  highlight,
}: {
  entry: PointsLeaderboardEntry;
  highlight: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
        highlight ? "bg-[var(--brand-primary-muted)]" : "bg-[var(--brand-bg)]"
      }`}
    >
      <LeaderboardRankBadge rank={entry.rank} />
      <div className="min-w-0 flex-1">
        <MemberNameWithAvatar
          avatarUrl={entry.avatarUrl}
          name={entry.displayName}
          nameClassName="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]"
          size="sm"
          subtitle={
            <>
              歷史 {formatPointsValue(entry.lifetimePoints)} 分
              {entry.streakMultiplier > 1 ? ` · 連擊 ×${entry.streakMultiplier.toFixed(2)}` : ""}
            </>
          }
          subtitleClassName="text-[0.75rem] text-[#86868b]"
          suffix={
            highlight ? (
              <span className="ml-1.5 text-[0.75rem] font-medium text-[var(--brand-primary-dark)]">
                你
              </span>
            ) : null
          }
        />
      </div>
      <p className="text-[1.125rem] font-bold text-[var(--brand-primary-dark)]">
        {formatPointsValue(entry.periodPoints)}
      </p>
    </li>
  );
}
