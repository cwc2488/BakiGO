"use client";

import { CalendarStatsPanel } from "@/components/calendar/CalendarStatsPanel";
import { NotificationPermissionBanner } from "@/components/calendar/NotificationPermissionBanner";
import { refreshCalendarReminderSchedule } from "@/lib/calendar/calendar-reminder-runner";
import { DayTimeGrid } from "@/components/calendar/DayTimeGrid";
import { RecurrenceScopeModal } from "@/components/calendar/RecurrenceScopeModal";
import {
  EventFormModal,
  buildDefaultFormValues,
  eventToFormValues,
  expandedEventToFormValues,
  formValuesToPayload,
  validateEventFormValues,
  type SharedEventFormContext,
} from "@/components/calendar/EventFormModal";
import { GoogleCalendarPanel } from "@/components/calendar/GoogleCalendarPanel";
import { MonthView } from "@/components/calendar/MonthView";
import { MonthDayAgenda } from "@/components/calendar/MonthDayAgenda";
import { WeekDayStrip } from "@/components/calendar/WeekDayStrip";
import { WeekView } from "@/components/calendar/WeekView";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { inferCalendarActivityTypeFromTitle } from "@/lib/calendar/calendar-activity-types";
import {
  attendanceFromExpandedSharedEvent,
  attendanceToCalendarEvent,
  isSharedEventAttending,
  loadMemberSharedCalendarAttendance,
  migrateSharedAttendanceColors,
  removeSharedCalendarAttendance,
  saveSharedCalendarAttendance,
  type SharedCalendarAttendance,
} from "@/lib/calendar/calendar-attendance-storage";
import { getMonthStart, shiftMonth, shiftWeek } from "@/lib/calendar/calendar-stats";
import { addDays, expandEventsForDay, expandEventsForRange, getMonthGridDates, getWeekDates } from "@/lib/calendar/recurrence";
import {
  getOccurrenceDateFromExpanded,
  isRecurringSeries,
  planRecurringDelete,
  planRecurringUpdate,
  type RecurrenceMutationResult,
} from "@/lib/calendar/recurrence-scope";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  loadGoogleCalendarConnection,
  updateGoogleCalendarEvent,
} from "@/lib/calendar/google-calendar";
import { getSharedCalendarEventColor, isSharedGoogleCalendarId } from "@/lib/calendar/shared-calendars";
import {
  loadShowSharedCalendar,
  saveShowSharedCalendar,
} from "@/lib/calendar/shared-calendar-preferences";
import { getSharedCalendarIds, getSharedCalendarSyncRange, syncSharedGoogleCalendars } from "@/lib/calendar/sync-shared-calendars";
import { buildMeetingAttendanceSummary } from "@/lib/calendar/meeting-attendance-summary";
import {
  isPersonalCalendarEventLogged,
  isRecordableCalendarActivityKey,
  removeBakiEventForPersonalCalendarEvent,
  removeBakiEventForSharedAttendance,
  syncPersonalCalendarEventToBakiEvent,
  syncSharedAttendanceToBakiEvent,
} from "@/lib/calendar/calendar-baki-event-sync";
import {
  isPersonalCalendarEvent,
  isSharedCalendarCacheFresh,
  loadSharedCalendarEvents,
  migrateSharedCalendarStorageIfNeeded,
  purgeSharedEventsFromPersonalStorage,
} from "@/lib/calendar/shared-calendar-storage";
import {
  formatChineseMonthDay,
  formatChineseWeekday,
  formatChineseYearMonth,
  getTodayDateString,
} from "@/lib/calendar/time-grid";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useSwipeNavigation } from "@/lib/hooks/use-swipe-navigation";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";
import type { CalendarEvent, CalendarSlotInterval, ExpandedCalendarEvent, RecurrenceEditScope } from "@/types/calendar-event";
import { useCallback, useEffect, useMemo, useState } from "react";

type CalendarViewMode = "day" | "week" | "month" | "stats";

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
  { value: "stats", label: "統計" },
];

function readCalendarOAuthStatusMessage(storage: ReturnType<typeof createLocalStorageAdapter>): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("google_connected") === "1") {
    window.history.replaceState({}, "", "/calendar");
    const connection = loadGoogleCalendarConnection(storage);
    if (connection?.email) {
      return `Google 日曆已連接：${connection.email}`;
    }
    return "Google 日曆已連接";
  }
  if (params.get("google_error") === "1") {
    window.history.replaceState({}, "", "/calendar");
    return "Google 日曆連接失敗，請重新連接並選擇正確帳號";
  }
  return null;
}

const INTERVAL_OPTIONS: Array<{ value: CalendarSlotInterval; label: string }> = [
  { value: 30, label: "30 分鐘" },
  { value: 60, label: "1 小時" },
  { value: 120, label: "2 小時" },
];

export default function CalendarPage() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const memberId = useMemo(() => resolveAuthenticatedMemberId(storage), [storage]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [monthAnchor, setMonthAnchor] = useState(getMonthStart(getTodayDateString()));
  const [slotInterval, setSlotInterval] = useState<CalendarSlotInterval>(60);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sharedEvents, setSharedEvents] = useState<CalendarEvent[]>(() => {
    migrateSharedCalendarStorageIfNeeded(storage);
    return loadSharedCalendarEvents(storage);
  });
  const [attendedSharedEvents, setAttendedSharedEvents] = useState<SharedCalendarAttendance[]>([]);
  const [showSharedCalendar, setShowSharedCalendar] = useState(() =>
    loadShowSharedCalendar(storage),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "view">("create");
  const [formReadOnly, setFormReadOnly] = useState(false);
  const [formValues, setFormValues] = useState(() => buildDefaultFormValues(getTodayDateString()));
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<ExpandedCalendarEvent | null>(null);
  const [recurrenceScopeMode, setRecurrenceScopeMode] = useState<"edit" | "delete" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(() =>
    readCalendarOAuthStatusMessage(storage),
  );
  const [sharedSyncState, setSharedSyncState] = useState<"idle" | "loading" | "done" | "error">(() =>
    isSharedCalendarCacheFresh(storage, memberId) ? "done" : "idle",
  );
  const [viewingExpandedEvent, setViewingExpandedEvent] = useState<ExpandedCalendarEvent | null>(null);
  const [attendNewFriendsCount, setAttendNewFriendsCount] = useState(0);
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [personalEventLogged, setPersonalEventLogged] = useState(false);
  const [isLoggingPersonalEvent, setIsLoggingPersonalEvent] = useState(false);

  const reloadAttendance = useCallback(() => {
    migrateSharedAttendanceColors(storage);
    setAttendedSharedEvents(loadMemberSharedCalendarAttendance(storage, memberId));
  }, [memberId, storage]);

  const reloadEvents = useCallback(() => {
    migrateSharedCalendarStorageIfNeeded(storage);
    purgeSharedEventsFromPersonalStorage(storage, getSharedCalendarIds());
    setEvents(createCalendarEventRepository(storage).getByMemberId(memberId).filter(isPersonalCalendarEvent));
    reloadAttendance();
  }, [memberId, reloadAttendance, storage]);

  useEffect(() => {
    queueMicrotask(() => {
      purgeSharedEventsFromPersonalStorage(storage, getSharedCalendarIds());
      reloadEvents();
    });
  }, [reloadEvents, storage]);

  useEffect(() => {
    let cancelled = false;

    if (isSharedCalendarCacheFresh(storage, memberId)) {
      return () => {
        cancelled = true;
      };
    }

    const { rangeStart, rangeEnd } = getSharedCalendarSyncRange();

    queueMicrotask(() => {
      if (loadSharedCalendarEvents(storage).length === 0) {
        setSharedSyncState("loading");
      }
    });

    void (async () => {
      try {
        const result = await syncSharedGoogleCalendars(storage, memberId, rangeStart, rangeEnd);
        if (!cancelled) {
          setSharedEvents(result.events);
          reloadEvents();
          setSharedSyncState("done");
          if (!result.fromCache && result.count > 0) {
            setStatusMessage(`已載入共用行事曆 ${result.count} 筆行程`);
          }
        }
      } catch (caught) {
        if (!cancelled) {
          const hasCachedEvents = loadSharedCalendarEvents(storage).length > 0;
          setSharedSyncState(hasCachedEvents ? "done" : "error");
          if (!hasCachedEvents) {
            setStatusMessage(
              caught instanceof Error ? caught.message : "共用行事曆載入失敗，請稍後再試",
            );
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberId, reloadEvents, storage]);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekRangeStart = weekDates[0];
  const weekRangeEnd = weekDates[6];
  const monthGridDates = useMemo(() => {
    const dates = getMonthGridDates(monthAnchor);
    return { start: dates[0], end: dates[dates.length - 1] };
  }, [monthAnchor]);

  const withSharedCalendarColor = useCallback((event: CalendarEvent): CalendarEvent => {
    if (!isSharedGoogleCalendarId(event.googleCalendarId)) {
      return event;
    }
    return { ...event, color: getSharedCalendarEventColor(event.googleCalendarId) };
  }, []);

  const attendedCalendarEvents = useMemo(
    () => attendedSharedEvents.map(attendanceToCalendarEvent).map(withSharedCalendarColor),
    [attendedSharedEvents, withSharedCalendarColor],
  );

  const normalizedSharedEvents = useMemo(
    () => sharedEvents.map(withSharedCalendarColor),
    [sharedEvents, withSharedCalendarColor],
  );

  const statsEvents = useMemo(() => {
    const personalEvents = events.filter(isPersonalCalendarEvent);
    return [...personalEvents, ...attendedCalendarEvents];
  }, [attendedCalendarEvents, events]);

  const visibleEvents = useMemo(() => {
    const personalEvents = events.filter(isPersonalCalendarEvent);
    const attendedIds = new Set(attendedCalendarEvents.map((event) => event.id));

    if (!showSharedCalendar) {
      const personalOnly = personalEvents.filter((event) => !attendedIds.has(event.id));
      return [...personalOnly, ...attendedCalendarEvents];
    }

    const sharedIds = new Set(normalizedSharedEvents.map((event) => event.id));
    const dedupedPersonal = personalEvents.filter(
      (event) => !sharedIds.has(event.id) && !attendedIds.has(event.id),
    );
    const sharedVisible = normalizedSharedEvents.filter((event) => !attendedIds.has(event.id));
    return [...dedupedPersonal, ...sharedVisible, ...attendedCalendarEvents];
  }, [attendedCalendarEvents, events, normalizedSharedEvents, showSharedCalendar]);

  const dayEvents = useMemo(
    () => expandEventsForDay(visibleEvents, selectedDate),
    [visibleEvents, selectedDate],
  );

  const weekEvents = useMemo(
    () => expandEventsForRange(visibleEvents, weekRangeStart, weekRangeEnd),
    [visibleEvents, weekRangeStart, weekRangeEnd],
  );

  const monthEvents = useMemo(
    () => expandEventsForRange(visibleEvents, monthGridDates.start, monthGridDates.end),
    [visibleEvents, monthGridDates.end, monthGridDates.start],
  );

  function toggleShowSharedCalendar(next: boolean) {
    setShowSharedCalendar(next);
    saveShowSharedCalendar(storage, next);
  }

  const weekStrip = useMemo(
    () =>
      weekDates.map((value, index) => ({
        value,
        weekday: ["一", "二", "三", "四", "五", "六", "日"][index],
        day: Number(value.slice(8, 10)),
        isSelected: value === selectedDate,
        isToday: value === getTodayDateString(),
      })),
    [selectedDate, weekDates],
  );

  function selectDate(date: string, switchToDay = false) {
    setSelectedDate(date);
    setMonthAnchor(getMonthStart(date));
    if (switchToDay) {
      setViewMode("day");
    }
  }

  function shiftNavigation(delta: number) {
    if (viewMode === "day") {
      setSelectedDate(addDays(selectedDate, delta));
    } else if (viewMode === "week") {
      setSelectedDate(shiftWeek(selectedDate, delta));
    }
  }

  function shiftWeekNavigation(delta: number) {
    if (viewMode === "day" || viewMode === "week") {
      setSelectedDate(addDays(selectedDate, delta * 7));
    }
  }

  const daySwipeHandlers = useSwipeNavigation(
    () => {
      if (viewMode === "day") {
        setSelectedDate(addDays(selectedDate, 1));
      }
    },
    () => {
      if (viewMode === "day") {
        setSelectedDate(addDays(selectedDate, -1));
      }
    },
  );

  const weekSwipeHandlers = useSwipeNavigation(
    () => shiftWeekNavigation(1),
    () => shiftWeekNavigation(-1),
  );

  function openCreate(startAt?: string) {
    const date = startAt?.slice(0, 10) ?? selectedDate;
    const time = startAt?.slice(11, 16) ?? "09:00";
    setFormMode("create");
    setFormReadOnly(false);
    setEditingEventId(null);
    setViewingExpandedEvent(null);
    setFormValues(buildDefaultFormValues(date, time));
    setFormOpen(true);
  }

  function syncAttendanceRecord(
    sharedEventId: string,
    activityTypeKey: string,
    newFriendsCount: number,
  ) {
    if (!viewingExpandedEvent) {
      return;
    }

    syncSharedAttendanceToBakiEvent(storage, memberId, {
      sharedEventId,
      activityTypeKey,
      newFriendsCount,
      title: viewingExpandedEvent.title,
      notes: viewingExpandedEvent.notes,
      startAt: viewingExpandedEvent.startAt,
    });
  }

  function handleToggleSharedAttend(
    attending: boolean,
    activityTypeKey: string,
    newFriendsCount: number,
  ) {
    if (!viewingExpandedEvent) {
      return;
    }

    const referenceDate = viewingExpandedEvent.startAt.slice(0, 10);

    if (attending) {
      saveSharedCalendarAttendance(
        storage,
        attendanceFromExpandedSharedEvent(
          memberId,
          viewingExpandedEvent,
          activityTypeKey,
          formValues.reminderMinutes,
          newFriendsCount,
        ),
      );
      syncAttendanceRecord(viewingExpandedEvent.sourceEventId, activityTypeKey, newFriendsCount);
      setStatusMessage(
        isRecordableCalendarActivityKey(activityTypeKey)
          ? `已標記參加並同步至紀錄中心，帶 ${newFriendsCount} 位新朋友`
          : `已標記參加，帶 ${newFriendsCount} 位新朋友`,
      );
      void refreshCalendarReminderSchedule(storage);
      setFormOpen(false);
      setViewingExpandedEvent(null);
    } else {
      removeSharedCalendarAttendance(storage, memberId, viewingExpandedEvent.sourceEventId);
      removeBakiEventForSharedAttendance(
        storage,
        memberId,
        viewingExpandedEvent.sourceEventId,
        referenceDate,
      );
      setAttendNewFriendsCount(0);
      setStatusMessage("已取消參加，紀錄中心同步移除");
      void refreshCalendarReminderSchedule(storage);
    }

    reloadAttendance();
    setAttendanceRefreshKey((current) => current + 1);
  }

  function openEdit(expanded: ExpandedCalendarEvent) {
    const isShared =
      expanded.attendedFromShared || isSharedGoogleCalendarId(expanded.googleCalendarId);

    if (isShared) {
      const attendance = isSharedEventAttending(storage, memberId, expanded.sourceEventId);
      setAttendNewFriendsCount(attendance?.newFriendsCount ?? 0);
      setViewingExpandedEvent(expanded);
      setFormMode("view");
      setFormReadOnly(true);
      setEditingEventId(null);
      setFormValues({
        ...expandedEventToFormValues(expanded),
        activityTypeKey:
          attendance?.activityTypeKey ??
          expanded.activityTypeKey ??
          inferCalendarActivityTypeFromTitle(expanded.title),
        reminderMinutes: attendance?.reminderMinutes ?? formValues.reminderMinutes,
      });
      setFormOpen(true);
      return;
    }

    setViewingExpandedEvent(null);
    setPersonalEventLogged(false);
    const source = createCalendarEventRepository(storage).getById(expanded.sourceEventId);
    if (!source) {
      return;
    }
    setFormMode("edit");
    setFormReadOnly(false);
    setEditingEventId(source.id);
    setEditingOccurrence(expanded);
    setFormValues({
      ...eventToFormValues(source),
      date: expanded.startAt.slice(0, 10),
      endDate: expanded.endAt.slice(0, 10),
      startTime: expanded.startAt.slice(11, 16),
      endTime: expanded.endAt.slice(11, 16),
      allDay: expanded.allDay,
      title: expanded.title,
      notes: expanded.notes ?? "",
      activityTypeKey: expanded.activityTypeKey ?? source.activityTypeKey ?? formValues.activityTypeKey,
    });
    setPersonalEventLogged(
      isPersonalCalendarEventLogged(storage, memberId, source.id, expanded.startAt.slice(0, 10)),
    );
    setFormOpen(true);
  }

  function handleLogPersonalEvent() {
    if (!editingEventId) {
      return;
    }

    const source = createCalendarEventRepository(storage).getById(editingEventId);
    if (!source) {
      return;
    }

    setIsLoggingPersonalEvent(true);
    try {
      const payload = formValuesToPayload(formValues);
      const calendarEvent: CalendarEvent = {
        ...source,
        ...payload,
        activityTypeKey: formValues.activityTypeKey,
      };
      syncPersonalCalendarEventToBakiEvent(
        storage,
        memberId,
        calendarEvent,
        formValues.date,
      );
      setPersonalEventLogged(true);
      setStatusMessage("已登記至紀錄中心");
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "登記失敗");
    } finally {
      setIsLoggingPersonalEvent(false);
    }
  }

  function handleFormChange(nextValues: typeof formValues) {
    setFormValues(nextValues);
    if (
      formMode === "view" &&
      viewingExpandedEvent &&
      isSharedEventAttending(storage, memberId, viewingExpandedEvent.sourceEventId)
    ) {
      saveSharedCalendarAttendance(
        storage,
        attendanceFromExpandedSharedEvent(
          memberId,
          viewingExpandedEvent,
          nextValues.activityTypeKey,
          nextValues.reminderMinutes,
          attendNewFriendsCount,
        ),
      );
      syncAttendanceRecord(
        viewingExpandedEvent.sourceEventId,
        nextValues.activityTypeKey,
        attendNewFriendsCount,
      );
      reloadAttendance();
      setAttendanceRefreshKey((current) => current + 1);
      void refreshCalendarReminderSchedule(storage);
    }
  }

  async function syncToGoogle(event: CalendarEvent, mode: "create" | "update" | "delete") {
    const connection = loadGoogleCalendarConnection(storage);
    const calendarId = connection?.selectedCalendarId ?? event.googleCalendarId;
    if (!connection || !calendarId || isSharedGoogleCalendarId(calendarId)) {
      return event;
    }

    if (mode === "delete" && event.googleEventId) {
      await deleteGoogleCalendarEvent(connection, calendarId, event.googleEventId, storage);
      return event;
    }

    const payload = {
      title: event.title,
      notes: event.notes,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      reminderMinutes: event.reminderMinutes,
    };

    if (mode === "create") {
      const googleEventId = await createGoogleCalendarEvent(connection, calendarId, payload, storage);
      return createCalendarEventRepository(storage).update(event.id, {
        googleEventId,
        googleCalendarId: calendarId,
      });
    }

    if (event.googleEventId) {
      await updateGoogleCalendarEvent(connection, calendarId, event.googleEventId, payload, storage);
    } else {
      const googleEventId = await createGoogleCalendarEvent(connection, calendarId, payload, storage);
      return createCalendarEventRepository(storage).update(event.id, {
        googleEventId,
        googleCalendarId: calendarId,
      });
    }

    return event;
  }

  async function applyRecurrenceMutation(plan: RecurrenceMutationResult): Promise<CalendarEvent | null> {
    const repository = createCalendarEventRepository(storage);

    if (plan.action === "delete") {
      const existing = repository.getById(plan.eventId);
      if (existing) {
        await syncToGoogle(existing, "delete");
      }
      repository.delete(plan.eventId);
      return null;
    }

    if (plan.action === "update") {
      const updated = repository.update(plan.eventId, plan.input);
      return syncToGoogle(updated, "update");
    }

    if (plan.updateParent) {
      repository.update(plan.updateParent.eventId, plan.updateParent.input);
    }
    const created = repository.create(plan.input);
    return syncToGoogle(created, "create");
  }

  function needsRecurrenceScopePrompt(source: CalendarEvent | undefined): boolean {
    if (!source || !editingOccurrence) {
      return false;
    }
    return isRecurringSeries(source);
  }

  async function finalizeEdit(scope?: RecurrenceEditScope) {
    const repository = createCalendarEventRepository(storage);
    const payload = formValuesToPayload(formValues);

    if (formMode === "create") {
      await syncToGoogle(repository.create({ memberId, ...payload }), "create");
      setFormOpen(false);
      reloadEvents();
      await refreshCalendarReminderSchedule(storage);
      setStatusMessage("行程已新增");
      return;
    }

    if (!editingEventId) {
      return;
    }

    const source = repository.getById(editingEventId);
    if (!source) {
      return;
    }

    if (needsRecurrenceScopePrompt(source)) {
      if (!scope) {
        setRecurrenceScopeMode("edit");
        return;
      }
      const occurrenceDate =
        getOccurrenceDateFromExpanded(editingOccurrence!, source) ?? formValues.date;
      const plan = planRecurringUpdate(source, occurrenceDate, scope, payload);
      await applyRecurrenceMutation(plan);
    } else {
      await syncToGoogle(repository.update(editingEventId, payload), "update");
    }

    setFormOpen(false);
    setEditingOccurrence(null);
    setRecurrenceScopeMode(null);
    reloadEvents();
    await refreshCalendarReminderSchedule(storage);
    setStatusMessage("行程已更新");
  }

  async function finalizeDelete(scope?: RecurrenceEditScope) {
    if (!editingEventId) {
      return;
    }

    const repository = createCalendarEventRepository(storage);
    const existing = repository.getById(editingEventId);
    if (!existing) {
      return;
    }

    if (needsRecurrenceScopePrompt(existing)) {
      if (!scope) {
        setRecurrenceScopeMode("delete");
        return;
      }
      const occurrenceDate =
        getOccurrenceDateFromExpanded(editingOccurrence!, existing) ?? formValues.date;
      await applyRecurrenceMutation(planRecurringDelete(existing, occurrenceDate, scope));
      removeBakiEventForPersonalCalendarEvent(storage, memberId, editingEventId, occurrenceDate);
    } else {
      await syncToGoogle(existing, "delete");
      removeBakiEventForPersonalCalendarEvent(
        storage,
        memberId,
        editingEventId,
        existing.startAt.slice(0, 10),
      );
      repository.delete(editingEventId);
    }

    setFormOpen(false);
    setEditingOccurrence(null);
    setRecurrenceScopeMode(null);
    reloadEvents();
    await refreshCalendarReminderSchedule(storage);
    setStatusMessage("行程已刪除");
  }

  async function handleSubmit() {
    const validationError = validateEventFormValues(formValues);
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }

    try {
      await finalizeEdit();
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "儲存失敗");
    }
  }

  async function handleDelete() {
    try {
      await finalizeDelete();
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "刪除失敗");
    }
  }

  async function handleRecurrenceScopeConfirm(scope: RecurrenceEditScope) {
    try {
      if (recurrenceScopeMode === "delete") {
        await finalizeDelete(scope);
      } else {
        await finalizeEdit(scope);
      }
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "操作失敗");
      setRecurrenceScopeMode(null);
    }
  }

  async function handleEventReschedule(
    expanded: ExpandedCalendarEvent,
    newStartAt: string,
    newEndAt: string,
  ) {
    const repository = createCalendarEventRepository(storage);
    const existing = repository.getById(expanded.sourceEventId);
    if (!existing) {
      return;
    }

    try {
      await syncToGoogle(
        repository.update(expanded.sourceEventId, {
          startAt: newStartAt,
          endAt: newEndAt,
        }),
        "update",
      );
      reloadEvents();
      await refreshCalendarReminderSchedule(storage);
      setStatusMessage(`行程已移至 ${newStartAt.slice(11, 16)}`);
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : "移動失敗");
    }
  }

  const headerTitle =
    viewMode === "month"
      ? formatChineseYearMonth(monthAnchor)
      : viewMode === "week"
        ? `${formatChineseMonthDay(weekRangeStart)} – ${formatChineseMonthDay(weekRangeEnd)}`
        : `${formatChineseMonthDay(selectedDate)} ${formatChineseWeekday(selectedDate)}`;

  const headerSubtitle =
    viewMode === "month"
      ? `${APP_EMOJI.page.calendar} 月視圖`
      : viewMode === "week"
        ? `${APP_EMOJI.page.calendar} 週視圖`
        : viewMode === "stats"
          ? `${APP_EMOJI.section.activity} 查詢統計`
          : `${APP_EMOJI.page.calendar} ${formatChineseYearMonth(selectedDate)}`;

  const monthSwipeHandlers = useSwipeNavigation(
    () => setMonthAnchor(shiftMonth(monthAnchor, 1)),
    () => setMonthAnchor(shiftMonth(monthAnchor, -1)),
  );

  const formSharedContext: SharedEventFormContext | undefined =
    formMode === "view" && viewingExpandedEvent
      ? {
          sharedEventId: viewingExpandedEvent.sourceEventId,
          isAttending: Boolean(
            isSharedEventAttending(storage, memberId, viewingExpandedEvent.sourceEventId),
          ),
          newFriendsCount: attendNewFriendsCount,
          onNewFriendsCountChange: (count) => {
            setAttendNewFriendsCount(count);
            if (
              isSharedEventAttending(storage, memberId, viewingExpandedEvent.sourceEventId)
            ) {
              saveSharedCalendarAttendance(
                storage,
                attendanceFromExpandedSharedEvent(
                  memberId,
                  viewingExpandedEvent,
                  formValues.activityTypeKey,
                  formValues.reminderMinutes,
                  count,
                ),
              );
              reloadAttendance();
              setAttendanceRefreshKey((current) => current + 1);
            }
          },
          attendanceSummary: (() => {
            void attendanceRefreshKey;
            const summary = buildMeetingAttendanceSummary(
              viewingExpandedEvent.sourceEventId,
              storage,
            );
            return {
              totalParticipants: summary.totalParticipants,
              totalNewFriends: summary.totalNewFriends,
              participants: summary.participants.map((participant) => ({
                name: participant.name,
                newFriendsCount: participant.newFriendsCount,
              })),
            };
          })(),
          onToggleAttend: handleToggleSharedAttend,
        }
      : undefined;

  const personalLogContext =
    formMode === "edit" && editingEventId && isRecordableCalendarActivityKey(formValues.activityTypeKey)
      ? {
          isLogged: personalEventLogged,
          isLogging: isLoggingPersonalEvent,
          onLogActivity: handleLogPersonalEvent,
        }
      : undefined;

  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="calendar-container flex flex-col gap-4 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.8125rem] font-medium text-[#86868b]">{headerSubtitle}</p>
              <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1d1d1f]">
                {headerTitle}
              </h1>
            </div>
            {viewMode !== "stats" ? (
              <button
                className="rounded-full bg-[var(--cal-primary)] px-4 py-2 text-[0.875rem] font-semibold text-white"
                onClick={() => openCreate()}
                type="button"
              >
                {APP_EMOJI.action.addRecord} 新增
              </button>
            ) : null}
          </div>

          <div className="flex gap-1 rounded-xl bg-[var(--cal-primary-muted)] p-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`flex-1 rounded-lg py-2 text-[0.8125rem] font-semibold ${
                  viewMode === option.value
                    ? "bg-[var(--brand-surface)] text-[#1d1d1f] shadow-sm"
                    : "text-[#86868b]"
                }`}
                onClick={() => {
                  if (option.value === "month") {
                    setMonthAnchor(getMonthStart(selectedDate));
                  }
                  setViewMode(option.value);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          {viewMode !== "month" && viewMode !== "stats" ? (
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-[var(--cal-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-medium text-[#636366]"
                onClick={() => shiftNavigation(-1)}
                type="button"
              >
                ‹
              </button>
              <button
                className="rounded-lg border border-[var(--cal-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--cal-primary-dark)]"
                onClick={() => {
                  const today = getTodayDateString();
                  setSelectedDate(today);
                  setMonthAnchor(getMonthStart(today));
                }}
                type="button"
              >
                今天
              </button>
              <button
                className="rounded-lg border border-[var(--cal-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-[0.8125rem] font-medium text-[#636366]"
                onClick={() => shiftNavigation(1)}
                type="button"
              >
                ›
              </button>
            </div>
          ) : null}
        </header>

        <NotificationPermissionBanner />

        {viewMode !== "stats" ? (
          <GoogleCalendarPanel
            memberId={memberId}
            onSharedEventsSynced={setSharedEvents}
            onSynced={reloadEvents}
            onShowSharedCalendarChange={toggleShowSharedCalendar}
            selectedDate={selectedDate}
            sharedSyncState={sharedSyncState}
            showSharedCalendar={showSharedCalendar}
          />
        ) : null}

        {viewMode === "day" ? (
          <div className="space-y-4">
            <WeekDayStrip
              days={weekStrip}
              onSelectDate={selectDate}
              swipeHandlers={daySwipeHandlers}
            />

            <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--cal-border)] bg-[var(--cal-surface)] px-4 py-3">
              <p className="text-[0.875rem] font-medium text-[#636366]">時間間隔</p>
              <div className="flex gap-1 rounded-lg bg-[var(--cal-primary-muted)] p-1">
                {INTERVAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-medium ${
                      slotInterval === option.value
                        ? "bg-[var(--brand-surface)] text-[#1d1d1f] shadow-sm"
                        : "text-[#86868b]"
                    }`}
                    onClick={() => setSlotInterval(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {statusMessage ? (
              <p className="rounded-xl bg-[var(--cal-primary-light)] px-4 py-2.5 text-[0.875rem] text-[var(--cal-primary-dark)]">
                {statusMessage}
              </p>
            ) : null}

            <DayTimeGrid
              dayDate={selectedDate}
              events={dayEvents}
              intervalMinutes={slotInterval}
              onEventReschedule={(event, startAt, endAt) =>
                void handleEventReschedule(event, startAt, endAt)
              }
              onEventSelect={openEdit}
              onSlotSelect={openCreate}
              swipeHandlers={daySwipeHandlers}
            />
          </div>
        ) : null}

        {viewMode === "week" ? (
          <div className="space-y-4">
            {statusMessage ? (
              <p className="rounded-xl bg-[var(--cal-primary-light)] px-4 py-2.5 text-[0.875rem] text-[var(--cal-primary-dark)]">
                {statusMessage}
              </p>
            ) : null}
            <WeekView
              anchorDate={selectedDate}
              events={weekEvents}
              onEventSelect={openEdit}
              onSelectDate={(date) => selectDate(date, true)}
              selectedDate={selectedDate}
              swipeHandlers={weekSwipeHandlers}
            />
          </div>
        ) : null}

        {viewMode === "month" ? (
          <div className="space-y-4">
            <MonthView
              anchorDate={monthAnchor}
              events={monthEvents}
              onSelectDate={(date) => selectDate(date)}
              onShiftMonth={setMonthAnchor}
              selectedDate={selectedDate}
              swipeHandlers={monthSwipeHandlers}
            />
            <MonthDayAgenda
              date={selectedDate}
              events={monthEvents}
              onEventSelect={openEdit}
            />
          </div>
        ) : null}

        {viewMode === "stats" ? (
          <CalendarStatsPanel
            defaultEndDate={selectedDate}
            defaultStartDate={getMonthStart(selectedDate)}
            events={statsEvents}
          />
        ) : null}
      </main>

      <EventFormModal
        mode={formMode}
        onChange={handleFormChange}
        onClose={() => {
          setFormOpen(false);
          setViewingExpandedEvent(null);
          setEditingOccurrence(null);
          setRecurrenceScopeMode(null);
        }}
        onDelete={formMode === "edit" ? () => void handleDelete() : undefined}
        onSubmit={() => void handleSubmit()}
        open={formOpen}
        personalLogContext={personalLogContext}
        readOnly={formReadOnly}
        sharedContext={formSharedContext}
        values={formValues}
      />

      <RecurrenceScopeModal
        mode={recurrenceScopeMode === "delete" ? "delete" : "edit"}
        onClose={() => setRecurrenceScopeMode(null)}
        onConfirm={(scope) => void handleRecurrenceScopeConfirm(scope)}
        open={recurrenceScopeMode !== null}
      />
    </div>
  );
}
