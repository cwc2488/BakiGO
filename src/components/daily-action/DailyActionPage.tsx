"use client";

import {
  buildCalendarDayPlan,
  type CalendarDayPlanSummary,
} from "@/lib/calendar/calendar-day-plan";
import {
  attendanceToCalendarEvent,
  loadMemberSharedCalendarAttendance,
} from "@/lib/calendar/calendar-attendance-storage";
import { isPersonalCalendarEvent } from "@/lib/calendar/shared-calendar-storage";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { logTodayActivity, logTodayRecruit } from "@/lib/daily-action/log-today-action";
import {
  formatDisplayDate,
  getMemberAvatarUrl,
  getMemberDisplayName,
  loadMissionControlMetrics,
} from "@/lib/mission-control/format";
import {
  buildDailyActionSnapshot,
  formatDailyActionPercent,
  formatDailyActionProgress,
} from "@/lib/daily-action/daily-action-selectors";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { DailyActionMetricView, DailyActionSuperLeagueEntryView, TodayActionKey } from "@/types/daily-action";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QuickActivityModal } from "@/components/daily-action/QuickActivityModal";
import { QuickRecruitModal } from "@/components/daily-action/QuickRecruitModal";
import { SuperLeagueAddModal } from "@/components/daily-action/SuperLeagueAddModal";
import { TodayStepCard } from "@/components/president-ai/TodayStepCard";
import { GreetingHeader } from "@/components/ui/GreetingHeader";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";
import { TabRootShell } from "@/components/ui/TabRootShell";
import {
  addSuperLeagueEntry,
  removeSuperLeagueEntry,
  updateSuperLeagueEntry,
} from "@/lib/daily-action/super-league-entries";

function TodayCalendarPlanCard({ plan }: { plan: CalendarDayPlanSummary }) {
  return (
    <section className="rounded-[1.75rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[var(--cal-text)]">
            {APP_EMOJI.section.calendarToday} 今日行程
          </h2>
          <p className="mt-1 text-[0.8125rem] text-[var(--cal-text-muted)]">
            共 {plan.totalCount} 項 · 會議 {plan.meetingCount} · 日常 {plan.dailyCount}
          </p>
        </div>
        <Link className="text-[0.8125rem] font-medium text-[var(--cal-primary-dark)]" href="/calendar">
          行事曆
        </Link>
      </div>
      {plan.items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {plan.items.slice(0, 5).map((item) => (
            <li key={`${item.title}-${item.startAt}`} className="rounded-xl bg-[var(--cal-primary-muted)] px-3 py-2.5">
              <p className="truncate text-[0.875rem] font-medium text-[#1d1d1f]">{item.title}</p>
              <p className="mt-0.5 text-[0.75rem] text-[#86868b]">
                {item.allDay ? "全天" : `${item.startAt.slice(11, 16)}–${item.endAt.slice(11, 16)}`}
                {" · "}
                {item.activityLabel}
                {item.attendedFromShared ? " · 已參加" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[0.875rem] text-[#86868b]">
          {APP_EMOJI.mood.empty} 今天尚無行程，可到行事曆新增或標記參加共用會議。
        </p>
      )}
    </section>
  );
}

function ProgressBar({ percent, color = "#77b539" }: { percent: number | null; color?: string }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--brand-bg)]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent ?? 0}%`, backgroundColor: color }}
      />
    </div>
  );
}

function MetricCard({
  title,
  metric,
  barColor = "#77b539",
  compact = false,
}: {
  index?: number;
  title: string;
  metric: DailyActionMetricView;
  barColor?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <h2 className={`font-semibold text-[#1d1d1f] ${compact ? "text-[0.875rem]" : "text-[1.125rem]"}`}>
        {title}
      </h2>
      <p
        className={`mt-2 font-semibold tracking-tight text-[#1d1d1f] ${
          compact ? "text-[1.375rem]" : "text-[1.75rem]"
        }`}
      >
        {formatDailyActionProgress(metric.current, metric.target)}
      </p>
      <ProgressBar color={barColor} percent={metric.progressPercent} />
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[0.8125rem] text-[#86868b]">完成率</span>
        <span className="text-[1rem] font-semibold text-[var(--brand-primary-dark)]">
          {formatDailyActionPercent(metric.progressPercent)}
        </span>
      </div>
      {metric.isRuleMissing ? (
        <p className="mt-2 text-[0.75rem] text-[#86868b]">目標規則尚待設定</p>
      ) : null}
    </section>
  );
}

function SuperLeagueCard({
  superLeague,
  onAddClick,
  onEditEntry,
  onToggleSupervisor,
}: {
  superLeague: ReturnType<typeof buildDailyActionSnapshot>["superLeague"];
  onAddClick: () => void;
  onEditEntry: (entry: DailyActionSuperLeagueEntryView) => void;
  onToggleSupervisor: (entryId: string, isSupervisor: boolean) => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.superLeague} 超級聯賽 10+2
          </h2>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">僅計入手動新增的夥伴</p>
        </div>
        <button
          className="shrink-0 rounded-xl bg-[var(--brand-primary)] px-3 py-2 text-[0.8125rem] font-semibold text-white"
          onClick={onAddClick}
          type="button"
        >
          + 新增
        </button>
      </div>

      {superLeague.entries.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--brand-border)] rounded-xl border border-[var(--brand-border)]">
          {superLeague.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => onEditEntry(entry)}
                type="button"
              >
                <p className="truncate text-[0.9375rem] font-medium text-[#1d1d1f]">
                  {entry.displayName}
                </p>
                <p className="mt-0.5 text-[0.75rem] text-[#86868b]">點擊編輯姓名</p>
              </button>
              <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-[var(--brand-bg)] p-1">
                <button
                  className={`rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium ${
                    !entry.isSupervisor
                      ? "bg-white text-[var(--brand-primary-dark)] shadow-sm"
                      : "text-[#86868b]"
                  }`}
                  onClick={() => onToggleSupervisor(entry.id, false)}
                  type="button"
                >
                  會員
                </button>
                <button
                  className={`rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium ${
                    entry.isSupervisor
                      ? "bg-white text-[var(--brand-primary-dark)] shadow-sm"
                      : "text-[#86868b]"
                  }`}
                  onClick={() => onToggleSupervisor(entry.id, true)}
                  type="button"
                >
                  督導
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--brand-bg)] px-4 py-3 text-[0.8125rem] text-[#86868b]">
          {APP_EMOJI.mood.empty} 尚無夥伴，按「+ 新增」開始記錄。
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div className="flex items-end justify-between">
          <span className="text-[0.875rem] text-[#86868b]">第一代</span>
          <span className="font-semibold text-[#1d1d1f]">
            {formatDailyActionProgress(
              superLeague.firstGeneration.current,
              superLeague.firstGeneration.target,
            )}
          </span>
        </div>
        <ProgressBar color="#30d158" percent={superLeague.firstGeneration.progressPercent} />
        <div className="flex items-end justify-between">
          <span className="text-[0.875rem] text-[#86868b]">督導</span>
          <span className="font-semibold text-[#1d1d1f]">
            {formatDailyActionProgress(
              superLeague.supervisor.current,
              superLeague.supervisor.target,
            )}
          </span>
        </div>
        <ProgressBar color="#30d158" percent={superLeague.supervisor.progressPercent} />
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-[var(--brand-border)] pt-3">
        <span className="text-[0.875rem] text-[#86868b]">總完成率</span>
        <span className="text-[1.125rem] font-semibold text-[#248a3d]">
          {formatDailyActionPercent(superLeague.completionPercent)}
        </span>
      </div>
      <ProgressBar color="#248a3d" percent={superLeague.completionPercent} />
    </section>
  );
}

const TODAY_ACTIONS: Array<{ key: TodayActionKey; label: string; emoji: string }> = [
  { key: "measurement", label: "量測", emoji: APP_EMOJI.action.measurement },
  { key: "consultation", label: "諮詢", emoji: APP_EMOJI.action.consultation },
  { key: "recruit", label: "招募會員", emoji: APP_EMOJI.action.recruit },
];

function DailyActionView({
  metrics,
  onMetricsChange,
}: {
  metrics: MemberComputedMetrics;
  onMetricsChange: (metrics: MemberComputedMetrics) => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const memberId = useMemo(() => resolveAuthenticatedMemberId(storage), [storage]);
  const [refreshKey, setRefreshKey] = useState(0);
  const snapshot = useMemo(() => {
    void refreshKey;
    return buildDailyActionSnapshot(metrics, storage);
  }, [metrics, refreshKey, storage]);
  const todayPlan = useMemo(() => {
    void refreshKey;
    const personal = createCalendarEventRepository(storage)
      .getByMemberId(memberId)
      .filter(isPersonalCalendarEvent);
    const attended = loadMemberSharedCalendarAttendance(storage, memberId).map(
      attendanceToCalendarEvent,
    );
    return buildCalendarDayPlan([...personal, ...attended], snapshot.referenceDate);
  }, [memberId, refreshKey, snapshot.referenceDate, storage]);
  const displayName = getMemberDisplayName();
  const avatarUrl = getMemberAvatarUrl();
  const [recruitModalOpen, setRecruitModalOpen] = useState(false);
  const [superLeagueModalOpen, setSuperLeagueModalOpen] = useState(false);
  const [editingSuperLeagueEntryId, setEditingSuperLeagueEntryId] = useState<string | null>(null);
  const [activityModalType, setActivityModalType] = useState<"measurement" | "consultation" | null>(
    null,
  );
  const searchParams = useSearchParams();

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "measurement" || action === "consultation") {
      setActivityModalType(action);
      return;
    }
    if (action === "recruit") {
      setRecruitModalOpen(true);
    }
  }, [searchParams]);

  const editingSuperLeagueEntry = useMemo(() => {
    if (!editingSuperLeagueEntryId) {
      return null;
    }
    return (
      snapshot.superLeague.entries.find((entry) => entry.id === editingSuperLeagueEntryId) ?? null
    );
  }, [editingSuperLeagueEntryId, snapshot.superLeague.entries]);

  const handleAction = useCallback((actionKey: TodayActionKey) => {
    if (actionKey === "recruit") {
      setRecruitModalOpen(true);
      return;
    }
    if (actionKey === "measurement" || actionKey === "consultation") {
      setActivityModalType(actionKey);
    }
  }, []);

  const handleRecruitSubmit = useCallback(
    async (input: Parameters<typeof logTodayRecruit>[0]) => {
      const nextMetrics = logTodayRecruit(input, storage);
      onMetricsChange(nextMetrics);
      setRefreshKey((current) => current + 1);
    },
    [onMetricsChange, storage],
  );

  const handleActivitySubmit = useCallback(
    async (activityType: "measurement" | "consultation", input: Parameters<typeof logTodayActivity>[1]) => {
      const nextMetrics = logTodayActivity(activityType, input, storage);
      onMetricsChange(nextMetrics);
      setRefreshKey((current) => current + 1);
    },
    [onMetricsChange, storage],
  );

  const handleSuperLeagueSubmit = useCallback(
    (input: { displayName: string; isSupervisor: boolean }) => {
      if (editingSuperLeagueEntryId) {
        updateSuperLeagueEntry(storage, editingSuperLeagueEntryId, input);
      } else {
        const year = new Date(`${snapshot.referenceDate}T12:00:00`).getFullYear();
        addSuperLeagueEntry(storage, {
          ownerMemberId: memberId,
          displayName: input.displayName,
          isSupervisor: input.isSupervisor,
          year,
        });
      }
      setEditingSuperLeagueEntryId(null);
      setRefreshKey((current) => current + 1);
    },
    [editingSuperLeagueEntryId, memberId, snapshot.referenceDate, storage],
  );

  const handleSuperLeagueDelete = useCallback(() => {
    if (!editingSuperLeagueEntryId) {
      return;
    }
    removeSuperLeagueEntry(storage, editingSuperLeagueEntryId);
    setEditingSuperLeagueEntryId(null);
    setRefreshKey((current) => current + 1);
  }, [editingSuperLeagueEntryId, storage]);

  const handleToggleSupervisor = useCallback(
    (entryId: string, isSupervisor: boolean) => {
      updateSuperLeagueEntry(storage, entryId, { isSupervisor });
      setRefreshKey((current) => current + 1);
    },
    [storage],
  );

  const openSuperLeagueAdd = useCallback(() => {
    setEditingSuperLeagueEntryId(null);
    setSuperLeagueModalOpen(true);
  }, []);

  const openSuperLeagueEdit = useCallback((entry: DailyActionSuperLeagueEntryView) => {
    setEditingSuperLeagueEntryId(entry.id);
    setSuperLeagueModalOpen(true);
  }, []);

  return (
    <TabRootShell
      header={
        <GreetingHeader
          avatarUrl={avatarUrl}
          displayName={displayName}
          subtitle={`${formatDisplayDate(snapshot.referenceDate)} · 今日行動`}
        />
      }
    >
        <TodayStepCard
          focusMode={metrics.presidentAI.focusMode}
          onQuickLog={handleAction}
          priority={snapshot.topPriority}
          reasoning={metrics.presidentAI.reasoning[0]}
        />

        <TodayCalendarPlanCard plan={todayPlan} />

        <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5">
          <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.quickLog} 快速記錄
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {TODAY_ACTIONS.map((action) => (
              <button
                key={action.key}
                className="rounded-2xl bg-[#1d1d1f] px-3 py-3.5 text-[0.8125rem] font-semibold text-white transition-transform active:scale-[0.98]"
                onClick={() => handleAction(action.key)}
                type="button"
              >
                {action.emoji} {action.label}
              </button>
            ))}
          </div>
        </section>

        <QuickRecruitModal
          onClose={() => setRecruitModalOpen(false)}
          onSubmit={handleRecruitSubmit}
          open={recruitModalOpen}
        />

        <QuickActivityModal
          activityType={activityModalType}
          onClose={() => setActivityModalType(null)}
          onSubmit={handleActivitySubmit}
          open={activityModalType !== null}
        />

        <SuperLeagueAddModal
          editingEntry={editingSuperLeagueEntry}
          onClose={() => {
            setSuperLeagueModalOpen(false);
            setEditingSuperLeagueEntryId(null);
          }}
          onDelete={editingSuperLeagueEntryId ? handleSuperLeagueDelete : undefined}
          onSubmit={handleSuperLeagueSubmit}
          open={superLeagueModalOpen}
        />

        <div className="grid grid-cols-2 gap-3">
          <MetricCard compact metric={snapshot.monthlyMeasurement} title="本月量測" barColor="#77b539" />
          <MetricCard compact metric={snapshot.monthlyConsultation} title="本月諮詢" barColor="#77b539" />
        </div>
        <SuperLeagueCard
          onAddClick={openSuperLeagueAdd}
          onEditEntry={openSuperLeagueEdit}
          onToggleSupervisor={handleToggleSupervisor}
          superLeague={snapshot.superLeague}
        />
    </TabRootShell>
  );
}

export default function DailyActionPage() {
  const [metrics, setMetrics] = useState<MemberComputedMetrics | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setMetrics(loadMissionControlMetrics());
    });
  }, []);

  if (!metrics) {
    return (
      <div className={`flex min-h-full items-center justify-center ${PAGE_GRADIENT_CLASS} text-[var(--brand-text-muted)]`}>
        {APP_EMOJI.mood.loading} 載入今日行動…
      </div>
    );
  }

  return <DailyActionView metrics={metrics} onMetricsChange={setMetrics} />;
}
