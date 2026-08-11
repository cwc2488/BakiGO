"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import { CustomerPhotoCompareSection } from "@/components/customers/CustomerPhotoCompareSection";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import { compareBodyRecords } from "@/lib/customers/body-composition-compare";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import { buildBodyCompositionTrendSeries } from "@/lib/customers/body-composition-trends";
import { buildCoachingTodayStatus, formatCoachingTodayStatusLine } from "@/lib/coaching/coaching-completion";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  COACHING_MEAL_SLOT_LABELS,
  COACHING_STATUS_LABELS,
  type CoachingDailyLogDetail,
  type CoachingEnrollment,
} from "@/types/coaching";
import type { BodyCompositionRecord, CustomerProgressPhoto } from "@/types/customer";

type MealWithSignedUrl = CoachingDailyLogDetail["meals"][number] & {
  photo: (CoachingDailyLogDetail["meals"][number]["photo"] & { signedUrl?: string | null }) | null;
};

type DetailPayload = {
  enrollment: CoachingEnrollment;
  customerDisplayName: string;
  dailyLog: CoachingDailyLogDetail & { meals: MealWithSignedUrl[] };
  recentLogs: Array<CoachingDailyLogDetail>;
  bodyRecords: BodyCompositionRecord[];
  progressPhotos: CustomerProgressPhoto[];
};

export default function CoachingDetailPage({ enrollmentId }: { enrollmentId: string }) {
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logDate = coachingTodayLogDate();

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}?logDate=${encodeURIComponent(logDate)}`,
      );
      const data = (await response.json()) as DetailPayload & { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "無法載入陪跑詳情");
      }
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入陪跑詳情");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [enrollmentId]);

  const bodyRecords = payload?.bodyRecords ?? [];
  const comparison = useMemo(() => compareBodyRecords(bodyRecords), [bodyRecords]);
  const trendSeries = useMemo(() => buildBodyCompositionTrendSeries(bodyRecords), [bodyRecords]);
  const baselineRecord = useMemo(() => {
    const baselineId = payload?.enrollment.baselineBodyRecordId;
    if (!baselineId) {
      return bodyRecords.at(-1) ?? null;
    }
    return bodyRecords.find((record) => record.id === baselineId) ?? bodyRecords.at(-1) ?? null;
  }, [bodyRecords, payload?.enrollment.baselineBodyRecordId]);

  const latestRecord = bodyRecords[0] ?? null;
  const progressPhotos = payload?.progressPhotos ?? [];

  const customerDisplayName = payload?.customerDisplayName ?? "陪跑詳情";

  const todayStatus = payload
    ? formatCoachingTodayStatusLine(
        buildCoachingTodayStatus({
          enrollmentId: payload.enrollment.id,
          customerId: payload.enrollment.customerId,
          customerDisplayName,
          goal: payload.enrollment.goal,
          logDate,
          log: payload.dailyLog.id ? payload.dailyLog : null,
          meals: payload.dailyLog.meals,
        }),
      )
    : "";

  const sleepDisplay =
    payload?.dailyLog.sleepDuration ??
    (payload?.dailyLog.sleepBedtime && payload?.dailyLog.sleepWakeTime
      ? formatSleepTimeRange(payload.dailyLog.sleepBedtime, payload.dailyLog.sleepWakeTime)
      : null);

  const updateStatus = async (status: CoachingEnrollment["status"]) => {
    setBusy(true);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "更新失敗");
      }
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell backHref="/coaching" backLabel="返回陪跑中心" title={customerDisplayName}>
      {loading ? <p className="text-[0.9375rem] text-[#86868b]">載入中…</p> : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {payload ? (
        <div className="space-y-5">
          <CrmCard className="space-y-4">
            <CrmSectionTitle>{customerDisplayName}</CrmSectionTitle>
            <CrmField label="狀態" value={COACHING_STATUS_LABELS[payload.enrollment.status]} />
            <CrmField label="目標" value={payload.enrollment.goal} />
            <CrmField label="今日狀態" value={todayStatus} />
            <div className="grid gap-2 sm:grid-cols-3">
              {payload.enrollment.status === "active" ? (
                <>
                  <CrmButton disabled={busy} onClick={() => void updateStatus("paused")} type="button" variant="secondary">
                    暫停陪跑
                  </CrmButton>
                  <CrmButton disabled={busy} onClick={() => void updateStatus("completed")} type="button" variant="danger">
                    結束陪跑
                  </CrmButton>
                </>
              ) : null}
              {payload.enrollment.status === "paused" ? (
                <CrmButton disabled={busy} onClick={() => void updateStatus("active")} type="button">
                  恢復陪跑
                </CrmButton>
              ) : null}
            </div>
            <Link
              className="inline-flex text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]"
              href={`/customers/${payload.enrollment.customerId}`}
            >
              前往顧客詳情 →
            </Link>
          </CrmCard>

          <CrmCard className="space-y-4">
            <CrmSectionTitle>今日回報</CrmSectionTitle>
            {payload.dailyLog.id ? (
              <div className="space-y-4">
                <dl>
                  <CrmField label="水分 (ml)" value={payload.dailyLog.waterMl} />
                  <CrmField label="睡眠" value={sleepDisplay} />
                  <CrmField label="運動" value={payload.dailyLog.exerciseNote} />
                  <CrmField label="排便次數" value={payload.dailyLog.bowelMovementCount} />
                  <CrmField label="心得" value={payload.dailyLog.customerNote} />
                </dl>
                <div className="space-y-3">
                  {payload.dailyLog.meals.map((meal) => (
                    <div key={meal.id} className="rounded-[1rem] border border-[#eef2ea] p-3">
                      <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                        {COACHING_MEAL_SLOT_LABELS[meal.mealSlot]}
                      </p>
                      {meal.textNote ? <p className="mt-1 text-[0.875rem] text-[#636366]">{meal.textNote}</p> : null}
                      {meal.photo?.signedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={`${COACHING_MEAL_SLOT_LABELS[meal.mealSlot]}照片`}
                          className="mt-2 max-h-48 w-full rounded-[0.75rem] object-cover"
                          src={meal.photo.signedUrl}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[0.9375rem] text-[#86868b]">今天尚未建立回報。</p>
            )}
          </CrmCard>

          <CrmCard className="space-y-4">
            <CrmSectionTitle>每週結果（reuse body records）</CrmSectionTitle>
            <CrmField label="起始量測" value={baselineRecord?.recordDate ?? "—"} />
            <CrmField label="最新量測" value={latestRecord?.recordDate ?? "—"} />
            {comparison?.summary ? <p className="text-[0.9375rem] text-[#636366]">{comparison.summary}</p> : null}
            <BodyCompositionTrendCharts seriesList={trendSeries} />
          </CrmCard>

          {progressPhotos.some((photo) => photo.imageDataUrl) ? (
            <CrmCard className="space-y-4">
              <CrmSectionTitle>體態照片（既有 progress photos）</CrmSectionTitle>
              <CustomerPhotoCompareSection
                customerName={customerDisplayName}
                photos={progressPhotos.filter((photo) => photo.imageDataUrl)}
                readOnly
              />
            </CrmCard>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
