"use client";

import Link from "next/link";
import { QuickActivityModal } from "@/components/daily-action/QuickActivityModal";
import {
  PartnerCard,
  PartnerMetricValue,
  PartnerPrimaryButton,
  PartnerProgressTrack,
  PartnerSecondaryButton,
  PartnerStatusPill,
} from "@/components/partner-v2/PartnerUi";
import { logTodayActivity } from "@/lib/daily-action/log-today-action";
import type { MonthlyActivityProgressView } from "@/lib/daily-action/monthly-activity-progress";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { useCallback, useMemo, useState } from "react";

export function MonthlyActionHero({
  progress,
  onMetricsUpdated,
}: {
  progress: MonthlyActivityProgressView;
  onMetricsUpdated?: (metrics: MemberComputedMetrics) => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [activityModalType, setActivityModalType] = useState<"measurement" | "consultation" | null>(
    null,
  );

  const handleActivitySubmit = useCallback(
    async (
      activityType: "measurement" | "consultation",
      input: { customerName: string; customerPhone?: string; region?: string; note?: string },
    ) => {
      const metrics = logTodayActivity(activityType, input, storage);
      setActivityModalType(null);
      onMetricsUpdated?.(metrics);
    },
    [onMetricsUpdated, storage],
  );

  const consultationPercent = progress.consultation.progressPercent;
  const measurementPercent = progress.measurement.progressPercent;

  return (
    <>
      <PartnerCard className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-medium text-[var(--pv2-text-secondary)]">
              {progress.monthLabel}行動進度
            </p>
            <p className="mt-1 text-[0.8125rem] text-[var(--pv2-text-muted)]">
              完成 7 次諮詢<span className="mx-1">或</span>30 次量測
            </p>
          </div>
          <PartnerStatusPill status={progress.status} />
        </div>

        {progress.isRuleMissing ? (
          <p className="rounded-xl bg-[var(--pv2-surface-elevated)] px-4 py-3 text-[0.9375rem] text-[var(--pv2-text-secondary)]">
            等待使用者定義。
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[var(--pv2-text-secondary)]">諮詢</p>
              <PartnerMetricValue
                current={progress.consultation.current}
                target={progress.consultation.target}
              />
              <PartnerProgressTrack
                percent={consultationPercent}
                tone={progress.completedVia === "consultation" ? "success" : "brand"}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[var(--pv2-text-secondary)]">量測</p>
              <PartnerMetricValue
                current={progress.measurement.current}
                target={progress.measurement.target}
              />
              <PartnerProgressTrack
                percent={measurementPercent}
                tone={progress.completedVia === "measurement" ? "success" : "brand"}
              />
            </div>
          </div>
        )}

        {progress.status === "completed" ? (
          <p className="text-[0.9375rem] font-medium text-[var(--pv2-success)]">
            本月核心目標已達成
            {progress.completedVia === "consultation" ? "（諮詢）" : progress.completedVia === "measurement" ? "（量測）" : ""}
            。另一項仍可繼續累積。
          </p>
        ) : progress.status === "not_started" ? (
          <p className="text-[0.9375rem] text-[var(--pv2-text-secondary)]">
            完成第一次諮詢或量測，開始累積本月進度。
          </p>
        ) : progress.remainingHint ? (
          <p className="text-[0.9375rem] font-medium text-[var(--pv2-text-primary)]">
            {progress.remainingHint}
          </p>
        ) : null}

        <div className="flex gap-2.5">
          <PartnerPrimaryButton onClick={() => setActivityModalType("consultation")}>
            + 記錄諮詢
          </PartnerPrimaryButton>
          <PartnerSecondaryButton onClick={() => setActivityModalType("measurement")}>
            + 記錄量測
          </PartnerSecondaryButton>
        </div>

        <Link
          className="inline-flex min-h-10 items-center text-[0.875rem] font-semibold text-[var(--pv2-brand-primary-dark)]"
          href="/monthly-progress"
        >
          查看詳細進度 →
        </Link>
      </PartnerCard>

      <QuickActivityModal
        activityType={activityModalType}
        onClose={() => setActivityModalType(null)}
        onSubmit={handleActivitySubmit}
        open={activityModalType !== null}
      />
    </>
  );
}
