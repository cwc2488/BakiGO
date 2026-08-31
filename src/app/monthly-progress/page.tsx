"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  formatDisplayDate,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
  readMissionControlMetrics,
} from "@/lib/mission-control/format";
import { MonthlyActionHero } from "@/components/partner-v2/MonthlyActionHero";
import { buildDailyActionSnapshot } from "@/lib/daily-action/daily-action-selectors";
import { buildMonthlyActivityProgress } from "@/lib/daily-action/monthly-activity-progress";
import { PageShell } from "@/components/ui/PageShell";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { APP_ICON } from "@/lib/ui/app-icons";
import { useCallback, useEffect, useState } from "react";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { HomeLoadingSkeleton, HomeErrorState } from "@/components/home/states";

export default function MonthlyProgressPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(() => readMissionControlMetrics());
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      setMetrics(loadMissionControlMetrics(undefined, storage, undefined, { includeMapUniverse: false }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [storage]);

  useEffect(() => {
    if (!metrics) {
      refresh();
    }
  }, [metrics, refresh]);

  if (!metrics && !error) {
    return <HomeLoadingSkeleton />;
  }

  if (!metrics || error) {
    return <HomeErrorState message="無法載入本月進度" onRetry={refresh} />;
  }

  const daily = buildDailyActionSnapshot(metrics, storage);
  const progress = buildMonthlyActivityProgress({
    yearMonth: daily.yearMonth,
    monthlyConsultation: daily.monthlyConsultation,
    monthlyMeasurement: daily.monthlyMeasurement,
  });

  return (
    <PageShell
      backHref="/"
      subtitle={`${formatDisplayDate(metrics.missions.referenceDate)} · 7 諮詢或 30 量測`}
      title="本月行動進度"
      titleIcon={APP_ICON.section.activity}
    >
      <MonthlyActionHero progress={progress} onMetricsUpdated={setMetrics} />
      <p className="text-[0.8125rem] leading-relaxed text-[var(--pv2-text-muted)]">
        完成其中一項即達成本月核心目標。兩項指標仍會分別累積，方便你持續建立行動習慣。
      </p>
      <Link
        className="inline-flex min-h-10 items-center text-[0.875rem] font-semibold text-[var(--pv2-brand-primary-dark)]"
        href="/calendar"
      >
        從行事曆安排諮詢或量測 →
      </Link>
    </PageShell>
  );
}
