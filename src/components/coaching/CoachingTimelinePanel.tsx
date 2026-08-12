"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import type {
  CoachingTimelineEvent,
  CoachingTimelineFilter,
  CoachingTimelinePage,
} from "@/types/coaching-timeline";

const FILTERS: Array<{ id: CoachingTimelineFilter; label: string; disabled?: boolean }> = [
  { id: "all", label: "全部" },
  { id: "daily_report", label: "回報" },
  { id: "body_measurement", label: "量測" },
  { id: "attention", label: "需要關注" },
  { id: "coach_action", label: "教練紀錄" },
];

function EvidenceList({ event }: { event: CoachingTimelineEvent }) {
  if (event.evidenceRefs.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 rounded-[1rem] bg-[#f7f8f5] px-3 py-2">
      <p className="text-[0.75rem] font-medium text-[#86868b]">Evidence</p>
      {event.evidenceRefs.map((ref, index) => (
        <p key={`${ref.kind}-${ref.logDate ?? ""}-${index}`} className="text-[0.8125rem] text-[#636366]">
          {ref.logDate ? `${ref.logDate} · ` : ""}
          {ref.kind}
          {ref.displayValue != null ? ` · ${String(ref.displayValue)}` : ""}
        </p>
      ))}
    </div>
  );
}

function DailyExpanded({
  event,
  enrollmentId,
}: {
  event: Extract<CoachingTimelineEvent, { type: "daily_report" }>;
  enrollmentId: string;
}) {
  const [photos, setPhotos] = useState<Array<{ mealSlot: string; signedUrl: string | null }>>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (event.payload.kind !== "daily_report") return;
    let cancelled = false;
    void fetchCoachingWithMemberAuth(
      `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/meal-photos?logDate=${encodeURIComponent(event.logDate)}`,
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          ok?: boolean;
          photos?: Array<{ mealSlot: string; signedUrl: string | null }>;
          error?: string;
        };
        if (!response.ok || !body.ok) {
          throw new Error(body.error ?? "無法載入餐點照片");
        }
        if (!cancelled) {
          setPhotos(body.photos ?? []);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) setPhotoError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, event.logDate, event.payload.kind]);

  if (event.payload.kind === "missing_streak") {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-[0.875rem] text-[#636366]">未完成回報日期（可追溯）：</p>
        <p className="text-[0.8125rem] leading-relaxed text-[#86868b]">
          {(event.payload.missingDates ?? []).join("、")}
        </p>
        <EvidenceList event={event} />
      </div>
    );
  }

  const report = event.payload.customerReport;
  const ai = event.payload.aiCustomer;
  const coach = event.payload.coachBrief;

  return (
    <div className="mt-3 space-y-4">
      <section className="space-y-2">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[#86868b]">Customer 回報</p>
        {report?.customerNote ? (
          <p className="text-[0.9375rem] text-[#1d1d1f]">「{report.customerNote}」</p>
        ) : (
          <p className="text-[0.875rem] text-[#86868b]">無文字心得</p>
        )}
        <p className="text-[0.8125rem] text-[#636366]">
          水分 {report?.waterMl ?? "—"} ml · 睡眠 {report?.sleepBedtime ?? "—"}–
          {report?.sleepWakeTime ?? "—"} · 運動 {report?.exerciseNote ?? "—"} · 排便{" "}
          {report?.bowelMovementCount ?? "—"}
        </p>
        <div className="space-y-2">
          {(report?.meals ?? []).map((meal) => {
            const signed = photos.find((photo) => photo.mealSlot === meal.mealSlot)?.signedUrl;
            return (
              <div key={meal.mealSlot} className="rounded-[1rem] border border-[#eef2ea] px-3 py-2">
                <p className="text-[0.8125rem] font-medium text-[#1d1d1f]">{meal.mealSlotLabel}</p>
                <p className="text-[0.8125rem] text-[#636366]">{meal.textNote || "—"}</p>
                {meal.hasPhoto ? (
                  signed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={meal.mealSlotLabel} className="mt-2 max-h-40 rounded-lg object-cover" src={signed} />
                  ) : (
                    <p className="mt-1 text-[0.75rem] text-[#86868b]">照片載入中…</p>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
        {photoError ? <p className="text-[0.8125rem] text-[#cf1322]">{photoError}</p> : null}
      </section>

      <section className="space-y-2 border-t border-[#eef2ea] pt-3">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[#86868b]">AI Coaching</p>
        {event.payload.aiStatus === "failed" ? (
          <p className="text-[0.875rem] text-[#b54708]">AI 暫時無法生成（Customer 原始回報仍保留）</p>
        ) : null}
        {ai?.todayFeedback ? <p className="text-[0.875rem] text-[#1d1d1f]">{ai.todayFeedback}</p> : null}
        {ai?.tomorrowFocus ? (
          <p className="text-[0.8125rem] text-[#636366]">明日焦點：{ai.tomorrowFocus}</p>
        ) : null}
        {(ai?.adjustmentPriorities?.length ?? 0) > 0 ? (
          <p className="text-[0.8125rem] text-[#636366]">優先：{ai!.adjustmentPriorities.join("、")}</p>
        ) : null}
        {!ai?.todayFeedback && event.payload.aiStatus !== "failed" ? (
          <p className="text-[0.8125rem] text-[#86868b]">尚無 AI 輸出</p>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-[#eef2ea] pt-3">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[#86868b]">Coach Brief</p>
        {coach?.dailySummary ? <p className="text-[0.875rem] text-[#1d1d1f]">{coach.dailySummary}</p> : (
          <p className="text-[0.8125rem] text-[#86868b]">尚無教練摘要</p>
        )}
        {event.payload.interventionLevel ? (
          <p className="text-[0.8125rem] text-[#636366]">介入：{event.payload.interventionLevel}</p>
        ) : null}
      </section>

      <EvidenceList event={event} />
    </div>
  );
}

function MeasurementExpanded({ event }: { event: Extract<CoachingTimelineEvent, { type: "body_measurement" }> }) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[0.875rem] text-[#1d1d1f]">{event.payload.summary}</p>
      {event.payload.outcomeLabel ? (
        <p className="text-[0.8125rem] text-[#636366]">Outcome：{event.payload.outcomeLabel}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-[0.8125rem]">
          <thead>
            <tr className="text-[#86868b]">
              <th className="py-1 font-medium">指標</th>
              <th className="py-1 font-medium">前次</th>
              <th className="py-1 font-medium">本次</th>
              <th className="py-1 font-medium">變化</th>
            </tr>
          </thead>
          <tbody>
            {event.payload.metrics.map((metric) => (
              <tr key={metric.key} className="border-t border-[#eef2ea] text-[#1d1d1f]">
                <td className="py-1">{metric.label}</td>
                <td className="py-1">{metric.previous ?? "—"}</td>
                <td className="py-1">{metric.current ?? "—"}</td>
                <td className="py-1">
                  {metric.delta == null ? (event.payload.kind === "baseline" ? "Baseline" : "—") : metric.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EvidenceList event={event} />
    </div>
  );
}

function TimelineEventCard({
  event,
  enrollmentId,
  highlighted,
}: {
  event: CoachingTimelineEvent;
  enrollmentId: string;
  highlighted: boolean;
}) {
  const [expanded, setExpanded] = useState(highlighted);

  return (
    <article
      id={`timeline-event-${event.id}`}
      className={`rounded-[1.25rem] border px-4 py-4 ${
        highlighted ? "border-[var(--brand-primary)] bg-[#f4faf0]" : "border-[#e8ece4] bg-white"
      }`}
    >
      <button type="button" className="w-full text-left" onClick={() => setExpanded((value) => !value)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{event.title}</p>
            {event.summary ? <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#636366]">{event.summary}</p> : null}
          </div>
          <span className="shrink-0 text-[0.75rem] text-[#86868b]">{expanded ? "收合" : "展開"}</span>
        </div>
      </button>
      {expanded && event.type === "daily_report" ? (
        <DailyExpanded event={event} enrollmentId={enrollmentId} />
      ) : null}
      {expanded && event.type === "body_measurement" ? <MeasurementExpanded event={event} /> : null}
      {expanded && event.type === "intervention_change" ? (
        <div className="mt-3 space-y-2">
          <p className="text-[0.875rem] text-[#1d1d1f]">{event.payload.reason}</p>
          <EvidenceList event={event} />
        </div>
      ) : null}
      {expanded && event.type === "coach_action" ? (
        <div className="mt-3 space-y-2">
          {event.payload.relatedReasonLabel ? (
            <p className="text-[0.8125rem] text-[#636366]">處理：{event.payload.relatedReasonLabel}</p>
          ) : null}
          <p className="text-[0.875rem] text-[#1d1d1f]">{event.payload.note?.trim() || "（無文字說明）"}</p>
          <p className="text-[0.8125rem] font-medium text-[#1d1d1f]">狀態：{event.payload.statusLabel}</p>
          <EvidenceList event={event} />
        </div>
      ) : null}
    </article>
  );
}

export default function CoachingTimelinePanel({
  enrollmentId,
  focusDates = [],
  reasonCodes = [],
}: {
  enrollmentId: string;
  focusDates?: string[];
  reasonCodes?: string[];
}) {
  const [filter, setFilter] = useState<CoachingTimelineFilter>("all");
  const [events, setEvents] = useState<CoachingTimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const focusQuery = useMemo(() => focusDates.join(","), [focusDates]);
  const reasonQuery = useMemo(() => reasonCodes.join(","), [reasonCodes]);

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("filter", filter);
        params.set("limit", "14");
        if (cursor) params.set("cursor", cursor);
        if (focusQuery) params.set("focusDates", focusQuery);
        if (reasonQuery) params.set("reasonCodes", reasonQuery);
        const response = await fetchCoachingWithMemberAuth(
          `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/timeline?${params.toString()}`,
        );
        const body = (await response.json()) as CoachingTimelinePage & { ok?: boolean; error?: string };
        if (!response.ok || !body.ok) {
          throw new Error(body.error ?? "無法載入歷史紀錄");
        }
        setEvents((prev) => (append ? [...prev, ...body.events] : body.events));
        setNextCursor(body.nextCursor);
        setHasMore(body.hasMore);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入歷史紀錄");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [enrollmentId, filter, focusQuery, reasonQuery],
  );

  useEffect(() => {
    void loadPage(null, false);
  }, [loadPage]);

  useEffect(() => {
    if (focusDates.length === 0) return;
    const timer = window.setTimeout(() => {
      const first = document.getElementById(
        `timeline-event-${events.find((event) => event.attentionLinked)?.id ?? ""}`,
      );
      first?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [events, focusDates]);

  return (
    <div className="space-y-4">
      {(focusDates.length > 0 || reasonCodes.length > 0) && (
        <CrmCard className="space-y-2">
          <p className="text-[0.75rem] font-medium tracking-wide text-[#86868b]">系統判斷／Evidence</p>
          {reasonCodes.length > 0 ? (
            <p className="text-[0.875rem] text-[#1d1d1f]">原因：{reasonCodes.join("、")}</p>
          ) : null}
          {focusDates.length > 0 ? (
            <p className="text-[0.8125rem] text-[#636366]">相關日期：{focusDates.join("、")}</p>
          ) : null}
        </CrmCard>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            className={`min-h-10 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium ${
              item.disabled
                ? "cursor-not-allowed bg-[#f3f4f1] text-[#c7c7cc]"
                : filter === item.id
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[#f3f4f1] text-[#636366]"
            }`}
            onClick={() => {
              if (!item.disabled) setFilter(item.id);
            }}
          >
            {item.label}
            {item.disabled ? "（即將推出）" : ""}
          </button>
        ))}
      </div>

      {filter === "coach_action" && !loading && !error && events.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-[#e5e7eb] px-4 py-4 text-[0.9375rem] text-[#86868b]">
          目前尚無教練處理紀錄。
        </p>
      ) : null}

      {loading ? <p className="text-[0.9375rem] text-[#86868b]">載入歷史紀錄…</p> : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {!loading && !error && events.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-[#e5e7eb] px-4 py-4 text-[0.9375rem] text-[#86868b]">
          目前沒有符合條件的歷史事件。
        </p>
      ) : null}

      <div className="space-y-3">
        {events.map((event) => (
          <TimelineEventCard
            key={event.id}
            event={event}
            enrollmentId={enrollmentId}
            highlighted={event.attentionLinked}
          />
        ))}
      </div>

      {hasMore ? (
        <CrmButton
          type="button"
          disabled={loadingMore}
          onClick={() => void loadPage(nextCursor, true)}
        >
          {loadingMore ? "載入中…" : "載入更多"}
        </CrmButton>
      ) : null}
    </div>
  );
}
