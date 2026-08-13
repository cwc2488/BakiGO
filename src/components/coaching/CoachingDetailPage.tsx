"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyCompositionTrendCharts } from "@/components/customers/BodyCompositionTrendCharts";
import { CustomerPhotoCompareSection } from "@/components/customers/CustomerPhotoCompareSection";
import { CrmButton } from "@/components/members/ui";
import { PageShell } from "@/components/ui/PageShell";
import CoachingCoachActionPanel from "@/components/coaching/CoachingCoachActionPanel";
import CoachingDirectivePanel from "@/components/coaching/CoachingDirectivePanel";
import CoachingGrowthPanel from "@/components/coaching/CoachingGrowthPanel";
import CoachingTimelinePanel from "@/components/coaching/CoachingTimelinePanel";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import {
  coachingRelativeDayLabel,
  coachingTodayLogDate,
  listCoachingRecentLogDates,
} from "@/lib/coaching/coaching-time";
import {
  resolveEnrollmentPlannedEndDate,
  resolveEnrollmentStartDate,
} from "@/lib/coaching/enrollment-window";
import { buildBodyCompositionTrendSeries } from "@/lib/customers/body-composition-trends";
import {
  buildDetailActionCard,
  buildDetailTodayScanRows,
  COACH_TODAY_REPORT_SHORT,
  DETAIL_MORE_DEFAULT_OPEN,
  formatEnrollmentDateRange,
  humanizeOutcomeConclusion,
  resolveCoachTodayReportState,
} from "@/lib/coaching/presentation/coaching-workbench-presentation";
import { useSoftRefresh } from "@/lib/hooks/use-soft-refresh";
import {
  COACHING_MEAL_SLOT_LABELS,
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

function metricLine(
  label: string,
  baseline: number | null | undefined,
  latest: number | null | undefined,
  unit: string,
): string | null {
  if (baseline == null && latest == null) return null;
  if (baseline != null && latest != null) {
    return `${label}　${baseline} → ${latest} ${unit}`;
  }
  if (latest != null) return `${label}　目前 ${latest} ${unit}`;
  return `${label}　目前穩定`;
}

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
  const [showMore, setShowMore] = useState(DETAIL_MORE_DEFAULT_OPEN);
  const [loadMorePanels, setLoadMorePanels] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [progressPhotoCount, setProgressPhotoCount] = useState(0);
  const [actionSavedHint, setActionSavedHint] = useState(false);
  const recentDates = useMemo(() => listCoachingRecentLogDates(), []);

  const reload = useCallback(
    async (selectedLogDate = logDate, options?: { includePhotos?: boolean; soft?: boolean }) => {
      if (!options?.soft) setLoading(true);
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
        setProgressPhotoCount(
          typeof data.progressPhotoCount === "number"
            ? data.progressPhotoCount
            : (data.progressPhotos?.length ?? 0),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入陪跑詳情");
      } finally {
        if (!options?.soft) setLoading(false);
      }
    },
    [enrollmentId, logDate],
  );

  useEffect(() => {
    void reload(logDate);
  }, [enrollmentId, logDate, reload]);

  const aiStatus = payload?.aiOutput?.status;
  const pollAiPending =
    Boolean(payload?.dailyLog.submittedAt) &&
    (!aiStatus || aiStatus === "pending" || aiStatus === "processing");

  useSoftRefresh(() => reload(logDate, { soft: true, includePhotos: showPhotos }), {
    pollWhile: pollAiPending,
    pollIntervalMs: 12_000,
  });

  useEffect(() => {
    if (!showMore) {
      setLoadMorePanels(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadMorePanels(true), 0);
    return () => window.clearTimeout(timer);
  }, [showMore]);

  const bodyRecords = payload?.bodyRecords ?? [];
  const trendSeries = useMemo(() => buildBodyCompositionTrendSeries(bodyRecords), [bodyRecords]);
  const baselineRecord = useMemo(() => {
    const baselineId = payload?.enrollment.baselineBodyRecordId;
    if (!baselineId) return bodyRecords.at(-1) ?? null;
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

  const customerDisplayName = payload?.customerDisplayName ?? "陪跑詳情";
  const reportState = resolveCoachTodayReportState({
    todaySubmitted: Boolean(payload?.dailyLog.submittedAt),
    todayAiStatus: payload?.aiOutput?.status,
  });
  const scanRows = buildDetailTodayScanRows(payload?.dailyLog.id ? payload.dailyLog : null);
  const actionCard = buildDetailActionCard({
    submitted: Boolean(payload?.dailyLog.submittedAt),
    aiStatus: payload?.aiOutput?.status,
    coachAttentionRequired: Boolean(payload?.aiOutput?.coach?.coach_attention_required),
    attentionReason: payload?.aiOutput?.coach?.attention_reason,
    dailySummary: payload?.aiOutput?.coach?.daily_summary,
    interventionLevel: payload?.aiOutput?.finalInterventionLevel,
    bowelCount: payload?.dailyLog.bowelMovementCount,
  });

  const startDate = payload
    ? resolveEnrollmentStartDate(payload.enrollment.startedAt) ?? payload.enrollment.startedAt.slice(0, 10)
    : "—";
  const endDate = payload
    ? resolveEnrollmentPlannedEndDate({
        startedAt: payload.enrollment.startedAt,
        plannedEndAt: payload.enrollment.plannedEndAt,
      })
    : null;
  const dateRange = payload
    ? formatEnrollmentDateRange(startDate, endDate)
    : "—";

  const weightLine = metricLine(
    "體重",
    baselineRecord?.weightKg ?? null,
    latestRecord?.weightKg ?? null,
    "kg",
  );
  const fatLine = metricLine(
    "體脂",
    baselineRecord?.bodyFatPercent ?? null,
    latestRecord?.bodyFatPercent ?? null,
    "%",
  );
  const muscleLine = metricLine(
    "肌肉",
    baselineRecord?.skeletalMuscleKg ?? null,
    latestRecord?.skeletalMuscleKg ?? null,
    "kg",
  );

  const updateStatus = async (status: CoachingEnrollment["status"]) => {
    setBusy(true);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "更新失敗");
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell backHref="/coaching" backLabel="返回陪跑中心" title={customerDisplayName}>
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="載入陪跑詳情">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[1.25rem] bg-[#f0f1ef]" />
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {payload && !loading ? (
        <div className="space-y-5 pb-10">
          {/* Layer 1 — 今天 */}
          <section className="space-y-4 rounded-[1.25rem] bg-white px-4 py-4">
            <div>
              <h1 className="text-[1.375rem] font-semibold leading-tight text-[#1d1d1f] break-words">
                {customerDisplayName}
              </h1>
              <p className="mt-1 text-[0.9375rem] text-[#636366]">
                第 {progress?.dayNumber ?? "—"} 天
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">陪跑日期：{dateRange}</p>
            </div>

            <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">
              今天狀態：{COACH_TODAY_REPORT_SHORT[reportState]}
            </p>

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
                      "min-h-11 min-w-[4.75rem] flex-1 rounded-[0.875rem] border px-3 py-2 text-left",
                      selected
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
                        : "border-[#e5e5ea] bg-[#fafafa]",
                    ].join(" ")}
                    onClick={() => setLogDate(date)}
                  >
                    <p className="text-[0.8125rem] font-semibold text-[#1d1d1f]">
                      {coachingRelativeDayLabel(date)}
                    </p>
                  </button>
                );
              })}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-2">
              {scanRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2 border-b border-[#f2f2f2] py-2">
                  <dt className="text-[0.875rem] text-[#86868b]">{row.label}</dt>
                  <dd className="text-right text-[0.9375rem] font-medium text-[#1d1d1f] break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            {payload.dailyLog.customerNote?.trim() ? (
              <p className="text-[0.875rem] leading-relaxed text-[#636366] break-words">
                心得：{payload.dailyLog.customerNote.trim()}
              </p>
            ) : null}

            {payload.aiOutput?.status === "pending" || payload.aiOutput?.status === "processing" ? (
              <p className="text-[0.8125rem] text-[#86868b]">進階分析正在整理中</p>
            ) : null}
          </section>

          {/* Layer 2 — 今天建議你做什麼 */}
          <section className="rounded-[1.25rem] border border-[#e8ece4] bg-[#f7faf5] px-4 py-4">
            <p className="text-[0.75rem] font-medium tracking-wide text-[#86868b]">今天建議你做什麼</p>
            <h2 className="mt-2 text-[1.125rem] font-semibold text-[#1d1d1f] break-words">
              {actionCard.title}
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#1d1d1f] break-words">
              {actionCard.body}
            </p>
            {actionCard.suggestion ? (
              <p className="mt-2 text-[0.875rem] leading-relaxed text-[#636366] break-words">
                {actionCard.suggestion}
              </p>
            ) : null}
            {actionCard.secondaryNote ? (
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[#86868b] break-words">
                補充：{actionCard.secondaryNote}
              </p>
            ) : null}
            {actionCard.showRecordAction ? (
              <button
                type="button"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-[0.875rem] font-medium text-white"
                onClick={() => {
                  setShowMore(true);
                  setActionSavedHint(true);
                  window.setTimeout(() => {
                    document.getElementById("coach-more-actions")?.scrollIntoView({ behavior: "smooth" });
                  }, 50);
                }}
              >
                記錄已處理
              </button>
            ) : null}
            {actionSavedHint ? (
              <p className="mt-2 text-[0.8125rem] text-[#3f6212]">請在下方「教練處理紀錄」完成記錄。</p>
            ) : null}
          </section>

          {/* Layer 3 — 最近的變化 */}
          <section className="rounded-[1.25rem] bg-white px-4 py-4">
            <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">最近的變化</h2>
            <div className="mt-3 space-y-2 text-[0.9375rem] text-[#1d1d1f]">
              {weightLine ? <p>{weightLine}</p> : null}
              {fatLine ? <p>{fatLine}</p> : null}
              {muscleLine ? <p>{muscleLine}</p> : <p>肌肉　目前穩定</p>}
              <p className="text-[#636366]">
                顧客感受　
                {payload.dailyLog.customerNote?.trim()
                  ? payload.dailyLog.customerNote.trim()
                  : "尚無特別紀錄"}
              </p>
            </div>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-[#636366]">
              {humanizeOutcomeConclusion(progress?.outcomeStatus ?? null)}
            </p>
          </section>

          {/* Layer 4 — 更多 */}
          <section className="space-y-3">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between rounded-[1.25rem] border border-[#e5e7eb] bg-white px-4 text-left text-[0.9375rem] font-medium text-[#1d1d1f]"
              onClick={() => setShowMore((v) => !v)}
            >
              <span>查看更多陪跑資料</span>
              <span aria-hidden>{showMore ? "▴" : "▾"}</span>
            </button>

            {showMore ? (
              <div id="coach-more-actions" className="space-y-4">
                {loadMorePanels ? (
                  <>
                    <CoachingDirectivePanel enrollmentId={enrollmentId} />
                    <CoachingCoachActionPanel enrollmentId={enrollmentId} reasonCodes={reasonCodes} />
                    <CoachingGrowthPanel enrollmentId={enrollmentId} logDate={logDate} />
                  </>
                ) : (
                  <div className="space-y-2" aria-busy="true">
                    <div className="h-20 animate-pulse rounded-[1.25rem] bg-[#f0f1ef]" />
                    <div className="h-20 animate-pulse rounded-[1.25rem] bg-[#f0f1ef]" />
                  </div>
                )}

                <div className="rounded-[1.25rem] bg-white px-4 py-4">
                  <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">
                    {coachingRelativeDayLabel(logDate)}完整回報
                  </h3>
                  {payload.dailyLog.id ? (
                    <div className="mt-3 space-y-3">
                      {payload.dailyLog.meals.map((meal) => (
                        <div key={meal.id} className="rounded-[1rem] border border-[#eef2ea] p-3">
                          <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">
                            {COACHING_MEAL_SLOT_LABELS[meal.mealSlot]}
                          </p>
                          {meal.textNote ? (
                            <p className="mt-1 text-[0.875rem] text-[#636366] break-words">{meal.textNote}</p>
                          ) : null}
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
                  ) : (
                    <p className="mt-2 text-[0.875rem] text-[#86868b]">這天還沒有回報。</p>
                  )}
                </div>

                {progressPhotoCount > 0 ? (
                  <div className="rounded-[1.25rem] bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">體態照片</h3>
                      <button
                        type="button"
                        className="min-h-11 px-2 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
                        onClick={() => {
                          const next = !showPhotos;
                          setShowPhotos(next);
                          if (next && !payload.progressPhotos.some((photo) => photo.imageDataUrl)) {
                            void reload(logDate, { includePhotos: true });
                          }
                        }}
                      >
                        {showPhotos ? "收合" : "查看"}
                      </button>
                    </div>
                    {showPhotos ? (
                      payload.progressPhotos.some((photo) => photo.imageDataUrl) ? (
                        <CustomerPhotoCompareSection
                          customerName={customerDisplayName}
                          photos={payload.progressPhotos.filter((photo) => photo.imageDataUrl)}
                          readOnly
                        />
                      ) : (
                        <p className="mt-2 text-[0.875rem] text-[#86868b]">照片載入中…</p>
                      )
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-[1.25rem] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">完整量測紀錄</h3>
                    <button
                      type="button"
                      className="min-h-11 px-2 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
                      onClick={() => setShowCharts((v) => !v)}
                    >
                      {showCharts ? "收合" : "查看圖表"}
                    </button>
                  </div>
                  {showCharts ? <BodyCompositionTrendCharts seriesList={trendSeries} /> : null}
                </div>

                <div className="rounded-[1.25rem] bg-white px-4 py-4 space-y-3">
                  <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">陪跑設定</h3>
                  <p className="text-[0.875rem] text-[#636366]">目標：{payload.enrollment.goal || "—"}</p>
                  <p className="text-[0.875rem] text-[#636366]">陪跑日期：{dateRange}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {payload.enrollment.status === "active" ? (
                      <>
                        <CrmButton
                          disabled={busy}
                          onClick={() => void updateStatus("paused")}
                          type="button"
                          variant="secondary"
                        >
                          暫停陪跑
                        </CrmButton>
                        <CrmButton
                          disabled={busy}
                          onClick={() => void updateStatus("completed")}
                          type="button"
                          variant="danger"
                        >
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
                    className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]"
                    href={`/customers/${payload.enrollment.customerId}`}
                  >
                    前往顧客資料 →
                  </Link>
                </div>

                <div className="rounded-[1.25rem] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[1rem] font-semibold text-[#1d1d1f]">歷史紀錄</h3>
                    <button
                      type="button"
                      className="min-h-11 px-2 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
                      onClick={() => setTab(tab === "timeline" ? "overview" : "timeline")}
                    >
                      {tab === "timeline" ? "收合" : "查看"}
                    </button>
                  </div>
                  {tab === "timeline" ? (
                    <div className="mt-3">
                      <CoachingTimelinePanel
                        enrollmentId={enrollmentId}
                        focusDates={focusDates}
                        reasonCodes={reasonCodes}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}
