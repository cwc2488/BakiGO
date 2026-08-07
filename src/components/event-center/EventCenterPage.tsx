"use client";

import { todayISODate } from "@/lib/config/app-config";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import {
  getEventTypeDefinition,
  getRecordableEventTypes,
  getRecordableEventTypesByGroup,
  type EventTypeDefinition,
} from "@/lib/event-center/event-types";
import {
  formatShortDate,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { BakiEventCategory } from "@/types/baki-event";
import type { EventTimelineEntry } from "@/types/event-center";
import { PageShell } from "@/components/ui/PageShell";
import { PageErrorState, PageLoadingState } from "@/components/ui/PageStates";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";
import { PARTNER_LABELS } from "@/lib/ui/partner-labels";
import { useCallback, useEffect, useMemo, useState } from "react";

const TIMELINE_CATEGORY_LABELS: Record<BakiEventCategory, string> = {
  transaction: "成交",
  activity: "活動",
  qualification: "資格",
};

const SELECT_CLASS =
  "w-full appearance-none rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]";

interface EventTypeListItem {
  eventTypeKey: string;
  label: string;
  group: "daily" | "meeting";
  count: number;
}

function buildEventTypeList(
  recordableTypes: EventTypeDefinition[],
  timeline: EventTimelineEntry[],
): EventTypeListItem[] {
  const countByKey = new Map<string, number>();
  for (const event of timeline) {
    countByKey.set(event.eventTypeKey, (countByKey.get(event.eventTypeKey) ?? 0) + 1);
  }

  return recordableTypes.map((type) => ({
    eventTypeKey: type.key,
    label: type.label,
    group: type.recordGroup ?? "daily",
    count: countByKey.get(type.key) ?? 0,
  }));
}

function EventTypeSelect({
  eventTypeKey,
  onSelect,
}: {
  eventTypeKey: string;
  onSelect: (key: string) => void;
}) {
  const dailyTypes = getRecordableEventTypesByGroup("daily");
  const meetingTypes = getRecordableEventTypesByGroup("meeting");

  return (
    <label className="block space-y-2">
      <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">活動類型</span>
      <select
        className={SELECT_CLASS}
        onChange={(event) => onSelect(event.target.value)}
        required
        value={eventTypeKey}
      >
        <optgroup label="日常活動">
          {dailyTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="MAP 會議（可重複參加）">
          {meetingTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function EventHistoryList({
  items,
  selectedKey,
  onSelect,
}: {
  items: EventTypeListItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const dailyItems = items.filter((item) => item.group === "daily");
  const meetingItems = items.filter((item) => item.group === "meeting");

  function renderGroup(title: string, groupItems: EventTypeListItem[]) {
    if (groupItems.length === 0) {
      return null;
    }

    return (
      <div>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
          {title}
        </p>
        <ul className="mt-2 divide-y divide-[var(--brand-border)] overflow-hidden rounded-2xl border border-[var(--brand-border)]">
          {groupItems.map((item) => {
            const isSelected = selectedKey === item.eventTypeKey;

            return (
              <li key={item.eventTypeKey}>
                <button
                  className={`flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors ${
                    isSelected ? "bg-[var(--brand-primary-light)]" : "bg-[var(--brand-surface)] hover:bg-[var(--brand-primary-muted)]"
                  }`}
                  onClick={() => onSelect(item.eventTypeKey)}
                  type="button"
                >
                  <span className="text-[1rem] font-medium text-[#1d1d1f]">{item.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold ${
                      item.count > 0
                        ? "bg-[var(--brand-bg)] text-[#636366]"
                        : "bg-[var(--brand-primary-muted)] text-[#aeaeb2]"
                    }`}
                  >
                    {item.count} 筆
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {renderGroup("日常活動", dailyItems)}
      {renderGroup("MAP 會議", meetingItems)}
    </div>
  );
}

function EventHistoryDetail({
  events,
  selectedType,
}: {
  events: EventTimelineEntry[];
  selectedType: EventTypeDefinition;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-[#86868b]">歷程</p>
          <h3 className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
            {selectedType.label}
          </h3>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">{selectedType.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-semibold text-[#636366]">
          {events.length} 筆
        </span>
      </div>

      {events.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--brand-bg)] px-3 py-1 text-[0.75rem] font-medium text-[#636366]">
                  {TIMELINE_CATEGORY_LABELS[event.category]}
                </span>
                <time className="text-[0.8125rem] text-[#86868b]">
                  {formatShortDate(event.eventDate)}
                </time>
              </div>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#636366]">
                {event.subtitle}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl bg-white px-4 py-5 text-center">
          <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">尚無此類型的紀錄</p>
          <p className="mt-1 text-[0.875rem] text-[#86868b]">新增一筆後會顯示在這裡。</p>
        </div>
      )}
    </div>
  );
}

export default function EventCenterPage() {
  const recordableTypes = useMemo(() => getRecordableEventTypes(), []);
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [eventTypeKey, setEventTypeKey] = useState(recordableTypes[0]?.key ?? "");
  const [historyTypeKey, setHistoryTypeKey] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(todayISODate());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadMetrics = useCallback(() => {
    setLoadState("loading");
    try {
      setMetrics(loadMissionControlMetrics());
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadMetrics();
    });
  }, [loadMetrics]);

  const selectedType = useMemo(
    () => getEventTypeDefinition(eventTypeKey),
    [eventTypeKey],
  );

  const timeline = useMemo(
    () => metrics?.eventCenter.events ?? [],
    [metrics],
  );

  const eventTypeList = useMemo(
    () => buildEventTypeList(recordableTypes, timeline),
    [recordableTypes, timeline],
  );

  const selectedHistoryType = useMemo(
    () => (historyTypeKey ? getEventTypeDefinition(historyTypeKey) : null),
    [historyTypeKey],
  );

  const filteredHistory = useMemo(() => {
    if (!historyTypeKey) {
      return [];
    }
    return timeline.filter((event) => event.eventTypeKey === historyTypeKey);
  }, [historyTypeKey, timeline]);

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    if (!selectedType || selectedType.category !== "activity") {
      setError("請選擇紀錄類型");
      return;
    }

    setIsSaving(true);

    try {
      const storage = createLocalStorageAdapter();
      const nextMetrics = processEventForCurrentMember(
        {
          eventTypeKey: selectedType.key,
          eventCategory: "activity",
          eventDate,
          metadata: note.trim() ? { note: note.trim() } : undefined,
        },
        storage,
      );

      setMetrics(nextMetrics);
      setNote("");
      setEventDate(todayISODate());
      setHistoryTypeKey(selectedType.key);
    } catch {
      setError("儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadState === "loading") {
    return <PageLoadingState />;
  }

  if (loadState === "error" || !metrics) {
    return (
      <PageErrorState message="無法載入紀錄中心" onRetry={loadMetrics} title="載入失敗" />
    );
  }

  return (
    <PageShell
      subtitle={PARTNER_LABELS.recordCenterHint}
      title={PARTNER_LABELS.recordCenter}
      titleIcon={APP_ICON.page.events}
    >
        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 sm:p-7">
          <h2 className="flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
            <IconLabel icon={APP_ICON.action.addRecord}>新增紀錄</IconLabel>
          </h2>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <EventTypeSelect eventTypeKey={eventTypeKey} onSelect={setEventTypeKey} />

            {selectedType ? (
              <p className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3 text-[0.875rem] text-[#636366]">
                {selectedType.description}
              </p>
            ) : null}

            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">日期</span>
              <input
                className="w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
                onChange={(event) => setEventDate(event.target.value)}
                required
                type="date"
                value={eventDate}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">備註（選填）</span>
              <textarea
                className="min-h-[5rem] w-full rounded-2xl border border-[var(--brand-border)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </label>

            {error ? (
              <p className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
                {error}
              </p>
            ) : null}

            <button
              className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-4 text-[1.0625rem] font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "儲存中…" : "新增紀錄"}
            </button>
          </form>
        </section>

        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 sm:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
                紀錄歷程
              </h2>
              <p className="mt-2 text-[0.9375rem] text-[#86868b]">
                選擇活動類型後查看歷程
              </p>
            </div>
            <span className="shrink-0 text-[0.875rem] text-[#86868b]">
              共 {metrics.eventCenter.totalEventCount} 筆
            </span>
          </div>

          <div className="mt-5">
            <EventHistoryList
              items={eventTypeList}
              onSelect={setHistoryTypeKey}
              selectedKey={historyTypeKey}
            />
          </div>

          {selectedHistoryType ? (
            <EventHistoryDetail events={filteredHistory} selectedType={selectedHistoryType} />
          ) : (
            <div className="mt-5 rounded-2xl bg-[var(--brand-bg)] px-5 py-6 text-center">
              <p className="text-[1rem] font-semibold text-[#1d1d1f]">請從上方名單選擇活動</p>
              <p className="mt-2 text-[0.875rem] text-[#86868b]">
                選定後才會顯示該類型的完整歷程。
              </p>
            </div>
          )}
        </section>
    </PageShell>
  );
}
