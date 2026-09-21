"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMyFivePlusFive } from "@/lib/five-plus-five/client";
import { dayStatusLabel } from "@/lib/five-plus-five/stats";
import type { FivePlusFiveMyStats } from "@/types/five-plus-five";

/**
 * Prominent entry card on 我的 home — not a bottom-nav item.
 */
export function FivePlusFiveHomeCard() {
  const [stats, setStats] = useState<FivePlusFiveMyStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchMyFivePlusFive();
        if (!cancelled) setStats(result.stats);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fish = stats?.today.fishPool;
  const fishTarget = stats?.targets.fishPoolDaily;
  const invite = stats?.week.invitationFiveSteps;
  const inviteTarget = stats?.targets.invitationFiveStepsWeekly;
  const status = stats ? dayStatusLabel(stats.today.status) : failed ? "稍後再試" : "載入中…";

  return (
    <Link
      href="/5plus5"
      className="block rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5 shadow-[0_1px_2px_rgba(29,29,31,0.04)] transition-colors active:bg-[var(--brand-primary-muted)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
            每日行動
          </p>
          <h2 className="mt-1 text-[1.125rem] font-semibold text-[var(--brand-text)]">
            5＋5 行動
          </h2>
        </div>
        <span className="text-[0.75rem] font-medium text-[var(--brand-text-secondary)]">
          {status}
        </span>
      </div>
      <div className="mt-4 space-y-2 text-[0.9375rem] text-[var(--brand-text)]">
        <p>
          🐟 今日魚池{" "}
          {fishTarget != null ? `${fish ?? 0} / ${fishTarget}` : "—"}
        </p>
        <p>
          🎯 本週邀約5步驟{" "}
          {inviteTarget != null ? `${invite ?? 0} / ${inviteTarget}` : "—"}
        </p>
      </div>
    </Link>
  );
}
