"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import { CustomerPhotoCompareSection } from "@/components/customers/CustomerPhotoCompareSection";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import CoachingCoachActionPanel from "@/components/coaching/CoachingCoachActionPanel";
import CoachingGrowthPanel from "@/components/coaching/CoachingGrowthPanel";
import CoachingTimelinePanel from "@/components/coaching/CoachingTimelinePanel";
import { compareBodyRecords } from "@/lib/customers/body-composition-compare";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import { buildBodyCompositionTrendSeries } from "@/lib/customers/body-composition-trends";
import { buildCoachingTodayStatus, formatCoachingTodayStatusLine } from "@/lib/coaching/coaching-completion";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import {
  coachingRelativeDayLabel,
  coachingTodayLogDate,
  listCoachingRecentLogDates,
} from "@/lib/coaching/coaching-time";
import {
  formatCoachingDayProgressLabel,
  formatInterventionSuggestionLabel,
  sanitizeCoachFacingEvidenceLines,
} from "@/lib/coaching/presentation/coaching-ui-copy";
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
  aiOutput: {
    status: string;
    finalInterventionLevel: "normal" | "watch" | "coach_attention" | null;
    customer: {
      encouragement: string;
      today_feedback: string;
      daily_food_summary?: string;
      customer_voice_response?: string | null;
      adjustment_priorities: string[];
      tomorrow_focus: string;
      follow_up_for_tomorrow?: string | null;
    } | null;
    coach: {
      daily_summary: string;
      recurring_issue: string | null;
      improved_issue: string | null;
      proposed_intervention_level: string;
      coach_attention_required: boolean;
      attention_reason: string | null;
      evidence: string[];
      daily_nutrition_assessment?: {
        level: string;
        label: string;
        reasons: string[];
        positive_factors: string[];
        adjustment_subjects: string[];
        confidence: number;
      } | null;
    } | null;
    errorMessage: string | null;
  } | null;
  historicalTomorrowFocus: Array<{ logDate: string; tomorrowFocus: string }>;
};

export default function CoachingDetailPage({
  enrollmentId,
  initialTab = "overview",
  focusDates = [],
  reasonCodes = [],
}: {
  enrollmentId: string;
  initialTab?: "overview" | "timeline";
  focusDates?: string[];
  reasonCodes?: string[];
}) {
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logDate, setLogDate] = useState(coachingTodayLogDate());
  const [tab, setTab] = useState<"overview" | "timeline">(initialTab);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [showOutcomeDetails, setShowOutcomeDetails] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [loadSecondaryPanels, setLoadSecondaryPanels] = useState(false);
  const [progressPhotoCount, setProgressPhotoCount] = useState(0);
  const recentDates = useMemo(() => listCoachingRecentLogDates(), []);

  const reload = async (selectedLogDate = logDate, options?: { includePhotos?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ logDate: selectedLogDate });
      if (options?.includePhotos) params.set("includePhotos", "1");
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}?${params.toString()}`,
      );
      const data = (await response.json()) as DetailPayload & {
        ok?: boolean;
        error?: string;
        progressPhotoCount?: number;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "無法載入陪跑詳情");
      }
      setPayload(data);
      if (typeof data.progressPhotoCount === "number") {
        setProgressPhotoCount(data.progressPhotoCount);
      } else {
        setProgressPhotoCount(data.progressPhotos?.length ?? 0);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入陪跑詳情");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload(logDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId, logDate]);

  useEffect(() => {
    if (!payload || tab !== "overview") return;
    // First paint hero first; secondary panels start after a short defer.
    const timer = window.setTimeout(() => setLoadSecondaryPanels(true), 0);
    return () => window.clearTimeout(timer);
  }, [payload, tab]);

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
  const progress = useMemo(
    () =>
      payload
        ? buildCoachingProgressView({
            enrollment: payload.enrollment,
            bodyRecords,
            logDate,
          })
        : null,
    [payload, bodyRecords, logDate],
  );
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

      <div className="flex gap-2">
        <button
          type="button"
          className={`min-h-10 flex-1 rounded-full px-3 text-[0.875rem] font-medium ${
            tab === "overview" ? "bg-[#1d1d1f] text-white" : "bg-[#f3f4f1] text-[#636366]"
          }`}
          onClick={() => setTab("overview")}
        >
          總覽
        </button>
        <button
          type="button"
          className={`min-h-10 flex-1 rounded-full px-3 text-[0.875rem] font-medium ${
            tab === "timeline" ? "bg-[#1d1d1f] text-white" : "bg-[#f3f4f1] text-[#636366]"
          }`}
          onClick={() => setTab("timeline")}
        >
          歷史紀錄
        </button>
      </div>

      {tab === "timeline" ? (
        <CoachingTimelinePanel
          enrollmentId={enrollmentId}
          focusDates={focusDates}
          reasonCodes={reasonCodes}
        />
      ) : null}

      {payload && tab === "overview" ? (
        <div className="space-y-5">
          <CrmCard className="space-y-4">
            <CrmSectionTitle>{customerDisplayName}</CrmSectionTitle>
            <p className="text-[0.9375rem] text-[#636366]">
              {formatCoachingDayProgressLabel(progress?.dayNumber, progress?.dayTotal ?? 90)}
            </p>
            <CrmField label="目前狀態" value={COACHING_STATUS_LABELS[payload.enrollment.status]} />
            <CrmField label="目標" value={payload.enrollment.goal} />
            <CrmField label="今天回報" value={todayStatus} />
            {payload.aiOutput?.finalInterventionLevel === "coach_attention" ||
            payload.aiOutput?.coach?.coach_attention_required ? (
              <div className="rounded-[1rem] bg-[#fff1f0] px-3 py-3">
                <p className="text-[0.8125rem] font-medium text-[#b42318]">需要注意</p>
                <p className="mt-1 text-[0.9375rem] text-[#1d1d1f]">
                  {payload.aiOutput.coach?.attention_reason?.trim() || "建議今天關心這位顧客"}
                </p>
              </div>
            ) : null}
            {payload.aiOutput?.status === "completed" && payload.aiOutput.coach?.daily_summary ? (
              <div className="rounded-[1rem] bg-[#f7faf5] px-3 py-3">
                <p className="text-[0.8125rem] font-medium text-[#86868b]">今天建議做什麼</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
                  {payload.aiOutput.coach.daily_summary}
                </p>
              </div>
            ) : null}
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="最近三天">
              {recentDates.map((date) => {
                const selected = date === logDate;
                return (
                  <button
                    key={date}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={[
                      "min-w-[5rem] flex-1 rounded-[0.875rem] border px-3 py-2 text-left",
                      selected
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
                        : "border-[#e5e5ea] bg-white",
                    ].join(" ")}
                    onClick={() => setLogDate(date)}
                  >
                    <p className="text-[0.8125rem] font-semibold text-[#1d1d1f]">
                      {coachingRelativeDayLabel(date)}
                    </p>
                    <p className="text-[0.6875rem] text-[#86868b]">{date}</p>
                  </button>
                );
              })}
            </div>
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

          {loadSecondaryPanels ? (
            <CoachingCoachActionPanel enrollmentId={enrollmentId} reasonCodes={reasonCodes} />
          ) : (
            <p className="text-[0.8125rem] text-[#86868b]">教練處理紀錄載入中…</p>
          )}

          <CrmCard className="space-y-4">
            <CrmSectionTitle>{coachingRelativeDayLabel(logDate)}回報</CrmSectionTitle>
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
              <p className="text-[0.9375rem] text-[#86868b]">
                {coachingRelativeDayLabel(logDate)}尚未建立回報。
              </p>
            )}
          </CrmCard>

          <CrmCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CrmSectionTitle>今日教練回饋</CrmSectionTitle>
              <button
                type="button"
                className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                onClick={() => setShowAiDetails((v) => !v)}
              >
                {showAiDetails ? "收合詳細" : "查看詳細"}
              </button>
            </div>
            {!payload.aiOutput || payload.aiOutput.status === "pending" || payload.aiOutput.status === "processing" ? (
              <p className="text-[0.9375rem] text-[#86868b]">
                {payload.dailyLog.submittedAt ? "教練回饋生成中…" : "送出回報後會生成教練回饋。"}
              </p>
            ) : null}
            {payload.aiOutput?.status === "failed" ? (
              <p className="text-[0.9375rem] text-[#86868b]">今日教練回饋暫時無法生成。</p>
            ) : null}
            {payload.aiOutput?.status === "completed" && payload.aiOutput.customer ? (
              <div className="space-y-3 text-[0.9375rem]">
                <p className="text-[#1d1d1f]">{payload.aiOutput.customer.encouragement}</p>
                <p className="text-[#636366]">{payload.aiOutput.customer.today_feedback}</p>
                <CrmField
                  label="建議處理方式"
                  value={formatInterventionSuggestionLabel(payload.aiOutput.finalInterventionLevel)}
                />
                {showAiDetails ? (
                  <div className="space-y-4 border-t border-[#eef2ea] pt-3">
                    {payload.aiOutput.customer.customer_voice_response ? (
                      <div>
                        <p className="text-[0.8125rem] font-medium text-[#86868b]">顧客回饋回應</p>
                        <p className="mt-1 text-[#1d1d1f]">{payload.aiOutput.customer.customer_voice_response}</p>
                      </div>
                    ) : null}
                    {payload.aiOutput.customer.daily_food_summary ? (
                      <p className="text-[#636366]">飲食總評：{payload.aiOutput.customer.daily_food_summary}</p>
                    ) : null}
                    {payload.aiOutput.customer.adjustment_priorities.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-[#636366]">
                        {payload.aiOutput.customer.adjustment_priorities.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="text-[#1d1d1f]">
                      <span className="text-[#86868b]">明日焦點：</span>
                      {payload.aiOutput.customer.tomorrow_focus}
                    </p>
                    {payload.aiOutput.coach ? (
                      <div className="space-y-2">
                        <p className="text-[0.8125rem] font-medium text-[#86868b]">教練摘要補充</p>
                        {payload.aiOutput.coach.daily_nutrition_assessment ? (
                          <div className="space-y-1 rounded-[1rem] bg-[#f7faf5] px-3 py-3">
                            <p className="text-[0.8125rem] font-medium text-[#86868b]">今日飲食判斷</p>
                            <p className="text-[#1d1d1f]">
                              {payload.aiOutput.coach.daily_nutrition_assessment.label}
                            </p>
                            {payload.aiOutput.coach.daily_nutrition_assessment.adjustment_subjects.length > 0 ? (
                              <ul className="list-disc space-y-1 pl-5 text-[0.875rem] text-[#636366]">
                                {payload.aiOutput.coach.daily_nutrition_assessment.adjustment_subjects.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                        <CrmField label="重複議題" value={payload.aiOutput.coach.recurring_issue ?? "—"} />
                        <CrmField label="改善議題" value={payload.aiOutput.coach.improved_issue ?? "—"} />
                        {sanitizeCoachFacingEvidenceLines(payload.aiOutput.coach.evidence).length > 0 ? (
                          <div>
                            <p className="text-[0.8125rem] font-medium text-[#86868b]">為什麼提醒</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.875rem] text-[#636366]">
                              {sanitizeCoachFacingEvidenceLines(payload.aiOutput.coach.evidence).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {payload.historicalTomorrowFocus.length > 0 ? (
                      <div>
                        <p className="text-[0.8125rem] font-medium text-[#86868b]">歷史明日焦點</p>
                        <ul className="mt-2 space-y-1 text-[0.875rem] text-[#636366]">
                          {payload.historicalTomorrowFocus.map((item) => (
                            <li key={item.logDate}>
                              {item.logDate}：{item.tomorrowFocus}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CrmCard>

          <CrmCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CrmSectionTitle>目標與身體進展</CrmSectionTitle>
              <button
                type="button"
                className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                onClick={() => setShowOutcomeDetails((v) => !v)}
              >
                {showOutcomeDetails ? "收合詳細" : "查看詳細"}
              </button>
            </div>
            <CrmField label="目標" value={progress?.goalLabel ?? payload.enrollment.goal ?? "—"} />
            <CrmField
              label="陪跑天數"
              value={formatCoachingDayProgressLabel(progress?.dayNumber, progress?.dayTotal ?? 90)}
            />
            <CrmField label="量測進度" value={progress?.measurementStageLabel ?? "—"} />
            <CrmField label="目前狀態" value={progress?.outcomeStatusLabel ?? "—"} />
            {showOutcomeDetails ? (
              <div className="space-y-3 border-t border-[#eef2ea] pt-3">
                <CrmField label="最近趨勢" value={progress?.trendStatusLabel ?? "—"} />
                <CrmField
                  label="建議處理方式"
                  value={formatInterventionSuggestionLabel(payload.aiOutput?.finalInterventionLevel ?? null)}
                />
                <CrmField label="起始量測" value={baselineRecord?.recordDate ?? "—"} />
                <CrmField label="最新量測" value={latestRecord?.recordDate ?? "—"} />
                {progress?.baselineMissing ? (
                  <p className="text-[0.9375rem] text-[#636366]">尚未建立起始量測</p>
                ) : null}
                {progress?.waitingForRetest ? (
                  <p className="text-[0.9375rem] text-[#636366]">等待回測後比較身體變化</p>
                ) : null}
                {progress && !progress.waitingForRetest && !progress.baselineMissing ? (
                  <div className="space-y-1 text-[0.875rem] text-[#636366]">
                    {progress.metrics.map((metric) => (
                      <p key={metric.key}>
                        {metric.label}：{metric.baseline ?? "—"}
                        {" → "}
                        {metric.latest ?? "—"}
                        {metric.delta != null
                          ? `（${metric.delta > 0 ? "+" : ""}${metric.delta}${metric.unit}）`
                          : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
                {progress?.customerSummary ? (
                  <p className="text-[0.9375rem] text-[#1d1d1f]">{progress.customerSummary}</p>
                ) : comparison?.summary ? (
                  <p className="text-[0.9375rem] text-[#636366]">{comparison.summary}</p>
                ) : null}
                <BodyCompositionTrendCharts seriesList={trendSeries} />
              </div>
            ) : null}
          </CrmCard>

          {loadSecondaryPanels ? (
            <CoachingGrowthPanel enrollmentId={enrollmentId} logDate={logDate} />
          ) : (
            <p className="text-[0.8125rem] text-[#86868b]">成果與分享機會載入中…</p>
          )}

          {progressPhotoCount > 0 ? (
            <CrmCard className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <CrmSectionTitle>體態照片</CrmSectionTitle>
                <button
                  type="button"
                  className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]"
                  onClick={() => {
                    const next = !showPhotos;
                    setShowPhotos(next);
                    if (next && !progressPhotos.some((photo) => photo.imageDataUrl)) {
                      void reload(logDate, { includePhotos: true });
                    }
                  }}
                >
                  {showPhotos ? "收合" : "查看"}
                </button>
              </div>
              {showPhotos ? (
                progressPhotos.some((photo) => photo.imageDataUrl) ? (
                  <CustomerPhotoCompareSection
                    customerName={customerDisplayName}
                    photos={progressPhotos.filter((photo) => photo.imageDataUrl)}
                    readOnly
                  />
                ) : (
                  <p className="text-[0.875rem] text-[#86868b]">照片載入中…</p>
                )
              ) : null}
            </CrmCard>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
