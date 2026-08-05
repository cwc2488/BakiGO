"use client";

import { formatPointsValue } from "@/lib/points/streak-multiplier";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import Link from "next/link";

export function PointsHeroCard({
  metrics,
  viewerRank,
}: {
  metrics: MemberComputedMetrics;
  viewerRank?: number | null;
}) {
  const points = metrics.gamification.points;
  const streak = metrics.gamification.streak;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#248a3d]/20 bg-[linear-gradient(135deg,#248a3d_0%,#77b539_55%,#a8d86a_100%)] p-6 text-white shadow-[0_16px_48px_rgba(36,138,61,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-white/80">
            {APP_EMOJI.section.points} 我的積分
          </p>
          <p className="mt-2 text-[3rem] font-bold leading-none tracking-tight">
            {formatPointsValue(points.monthlyPoints)}
          </p>
          <p className="mt-2 text-[0.9375rem] text-white/90">
            {viewerRank ? `第 ${viewerRank} 名 · ` : ""}
            本月積分 · 歷史 {formatPointsValue(points.lifetimePoints)} 分
          </p>
        </div>
        <Link
          className="shrink-0 rounded-full bg-white/15 px-4 py-2 text-[0.8125rem] font-semibold text-white backdrop-blur-sm"
          href="/leaderboard"
        >
          {APP_EMOJI.mood.trophy} 排行榜 →
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[0.8125rem] font-semibold">
          {APP_EMOJI.mood.streak} 今日 +{formatPointsValue(points.todayPoints)}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-[0.8125rem] font-semibold">
          {APP_EMOJI.action.redeem} 可兌換 {formatPointsValue(points.availablePoints)}
        </span>
        {points.streakMultiplier > 1 ? (
          <span className="rounded-full bg-[#ffd60a] px-3 py-1.5 text-[0.8125rem] font-bold text-[#1d1d1f]">
            連擊 ×{points.streakMultiplier.toFixed(2)}
          </span>
        ) : null}
        {streak.currentStreak > 1 ? (
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-[0.8125rem] font-medium text-white/90">
            連續 {streak.currentStreak} 天
          </span>
        ) : null}
      </div>
    </section>
  );
}
