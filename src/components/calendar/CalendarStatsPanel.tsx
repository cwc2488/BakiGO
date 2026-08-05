"use client";

import {
  buildCalendarStats,
  getMonthEnd,
  getMonthStart,
  type CalendarStatsQuery,
  type CalendarStatsResult,
} from "@/lib/calendar/calendar-stats";
import { CALENDAR_EVENT_COLORS, type CalendarEvent, type CalendarEventColor } from "@/types/calendar-event";
import { getCalendarActivityTypeLabel } from "@/lib/calendar/calendar-activity-types";
import { useMemo, useState } from "react";

const COLOR_LABELS: Record<CalendarEventColor, string> = {
  blue: "藍",
  green: "綠",
  orange: "橙",
  red: "紅",
  purple: "紫",
  teal: "青",
  gray: "灰",
};

export function CalendarStatsPanel({
  events,
  defaultStartDate,
  defaultEndDate,
}: {
  events: CalendarEvent[];
  defaultStartDate: string;
  defaultEndDate: string;
}) {
  const [query, setQuery] = useState<CalendarStatsQuery>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    keyword: "",
  });

  const stats = useMemo(() => buildCalendarStats(events, query), [events, query]);

  return (
    <div className="space-y-4">
      <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
        <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">查詢條件</h2>
        <p className="mt-1 text-[0.8125rem] text-[#86868b]">
          個人行程全數計入；共用行事曆僅計入已標記「會參加」的行程。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[0.8125rem] font-medium text-[#636366]">開始日</span>
            <input
              className="date-input"
              onChange={(event) => setQuery((current) => ({ ...current, startDate: event.target.value }))}
              type="date"
              value={query.startDate}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[0.8125rem] font-medium text-[#636366]">結束日</span>
            <input
              className="date-input"
              onChange={(event) => setQuery((current) => ({ ...current, endDate: event.target.value }))}
              type="date"
              value={query.endDate}
            />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-[0.8125rem] font-medium text-[#636366]">關鍵字（標題／備註）</span>
            <input
              className="w-full rounded-xl border border-[var(--brand-border)] px-3 py-2.5"
              onChange={(event) => setQuery((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="例如：會議、諮詢"
              value={query.keyword ?? ""}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-[var(--cal-primary-muted)] px-3 py-1.5 text-[0.8125rem] text-[#636366]"
            onClick={() =>
              setQuery((current) => ({
                ...current,
                startDate: getMonthStart(current.startDate),
                endDate: getMonthEnd(current.startDate),
              }))
            }
            type="button"
          >
            本月
          </button>
          <button
            className="rounded-lg bg-[var(--cal-primary-muted)] px-3 py-1.5 text-[0.8125rem] text-[#636366]"
            onClick={() => {
              const end = defaultEndDate;
              const startDate = new Date(`${end}T12:00:00`);
              startDate.setDate(startDate.getDate() - 6);
              const pad = (n: number) => String(n).padStart(2, "0");
              setQuery((current) => ({
                ...current,
                startDate: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`,
                endDate: end,
              }));
            }}
            type="button"
          >
            近 7 天
          </button>
        </div>
      </section>

      <StatsSummary stats={stats} />
      <StatsByActivityType stats={stats} />
      <StatsByColor stats={stats} />
      <StatsEventList stats={stats} />
    </div>
  );
}

function StatsSummary({ stats }: { stats: CalendarStatsResult }) {
  const items = [
    { label: "行程次數", value: stats.totalOccurrences },
    { label: "不重複行程", value: stats.uniqueSourceEvents },
    { label: "總時數", value: `${stats.totalHours} 小時` },
    { label: "全天行程", value: stats.allDayCount },
    { label: "重複實例", value: stats.recurringInstanceCount },
    { label: "Google 同步", value: stats.googleSyncedCount },
    { label: "標記參加", value: stats.attendedSharedCount },
  ];

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">統計摘要</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-[var(--cal-primary-muted)] px-3 py-3">
            <dt className="text-[0.75rem] text-[#86868b]">{item.label}</dt>
            <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">{item.value}</dd>
          </div>
        ))}
      </dl>
      {stats.topTitles.length > 0 ? (
        <div className="mt-4">
          <p className="text-[0.8125rem] font-medium text-[#636366]">常見行程</p>
          <ul className="mt-2 space-y-1">
            {stats.topTitles.map((item) => (
              <li key={item.title} className="flex justify-between text-[0.875rem] text-[#1d1d1f]">
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 text-[#86868b]">{item.count} 次</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function StatsByActivityType({ stats }: { stats: CalendarStatsResult }) {
  if (stats.byActivityType.length === 0) {
    return null;
  }

  const groupLabel = {
    daily: "日常",
    meeting: "會議",
    other: "其他",
  } as const;

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">依行程種類</h2>
      <ul className="mt-4 space-y-2">
        {stats.byActivityType.map((item) => (
          <li key={item.key} className="flex items-center justify-between rounded-xl bg-[var(--cal-primary-muted)] px-3 py-2.5">
            <div>
              <p className="text-[0.875rem] font-medium text-[#1d1d1f]">{item.label}</p>
              <p className="text-[0.75rem] text-[#86868b]">{groupLabel[item.group]}</p>
            </div>
            <span className="text-[0.9375rem] font-semibold text-[var(--cal-primary-dark)]">{item.count} 次</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsByColor({ stats }: { stats: CalendarStatsResult }) {
  const entries = (Object.keys(stats.byColor) as CalendarEventColor[]).filter(
    (color) => stats.byColor[color] > 0,
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">顏色分布</h2>
      <ul className="mt-3 space-y-2">
        {entries.map((color) => (
          <li key={color} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[0.875rem]">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: CALENDAR_EVENT_COLORS[color].bg }}
              />
              {COLOR_LABELS[color]}
            </span>
            <span className="text-[0.875rem] font-medium text-[#636366]">{stats.byColor[color]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsEventList({ stats }: { stats: CalendarStatsResult }) {
  return (
    <section className="rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-4">
      <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">
        查詢結果 ({stats.events.length})
      </h2>
      {stats.events.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--cal-border)]">
          {stats.events.slice(0, 20).map((event) => (
            <li key={event.occurrenceId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[0.9375rem] font-medium text-[#1d1d1f]">{event.title}</p>
                <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">
                  {event.startAt.slice(0, 10)}{" "}
                  {event.allDay ? "全天" : `${event.startAt.slice(11, 16)}–${event.endAt.slice(11, 16)}`}
                  {" · "}
                  {getCalendarActivityTypeLabel(event.activityTypeKey)}
                  {event.attendedFromShared ? " · 已參加" : ""}
                </p>
              </div>
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CALENDAR_EVENT_COLORS[event.color].bg }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[0.875rem] text-[#86868b]">此區間沒有符合的行程</p>
      )}
      {stats.events.length > 20 ? (
        <p className="mt-2 text-[0.8125rem] text-[#86868b]">僅顯示前 20 筆</p>
      ) : null}
    </section>
  );
}
