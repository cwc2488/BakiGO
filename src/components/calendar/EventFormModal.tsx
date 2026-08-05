"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import {
  CALENDAR_OTHER_ACTIVITY_KEY,
  getCalendarDailyActivityTypes,
  getCalendarMeetingActivityTypes,
  getCalendarSelectableActivityTypes,
} from "@/lib/calendar/calendar-activity-types";
import { DEFAULT_CALENDAR_REMINDER_MINUTES } from "@/lib/calendar/calendar-reminder-options";
import { ReminderOptionsField } from "@/components/calendar/ReminderOptionsField";
import {
  CALENDAR_EVENT_COLORS,
  type CalendarEvent,
  type CalendarEventColor,
  type ExpandedCalendarEvent,
  type RecurrenceFrequency,
} from "@/types/calendar-event";

export interface EventFormValues {
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: CalendarEventColor;
  activityTypeKey: string;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceCustomUnit: "daily" | "weekly" | "monthly";
  recurrenceInterval: number;
  recurrenceNeverEnds: boolean;
  recurrenceEndDate: string;
  reminderMinutes: number[];
}

export interface MeetingAttendanceSummaryView {
  totalParticipants: number;
  totalNewFriends: number;
  participants: Array<{ name: string; newFriendsCount: number }>;
}

export interface SharedEventFormContext {
  sharedEventId: string;
  isAttending: boolean;
  newFriendsCount: number;
  onNewFriendsCountChange: (count: number) => void;
  attendanceSummary: MeetingAttendanceSummaryView;
  onToggleAttend: (attending: boolean, activityTypeKey: string, newFriendsCount: number) => void;
}

export interface PersonalEventLogContext {
  isLogged: boolean;
  isLogging?: boolean;
  onLogActivity: () => void;
}

export function buildDefaultFormValues(date: string, startTime = "09:00"): EventFormValues {
  return {
    title: "",
    notes: "",
    date,
    startTime,
    endTime: addHoursToTime(startTime, 1),
    allDay: false,
    color: "green",
    activityTypeKey: CALENDAR_OTHER_ACTIVITY_KEY,
    recurrenceFrequency: "none",
    recurrenceCustomUnit: "weekly",
    recurrenceInterval: 1,
    recurrenceNeverEnds: true,
    recurrenceEndDate: "",
    reminderMinutes: [...DEFAULT_CALENDAR_REMINDER_MINUTES],
  };
}

export function eventToFormValues(event: CalendarEvent): EventFormValues {
  return {
    title: event.title,
    notes: event.notes ?? "",
    date: event.startAt.slice(0, 10),
    startTime: event.startAt.slice(11, 16),
    endTime: event.endAt.slice(11, 16),
    allDay: event.allDay,
    color: event.color,
    activityTypeKey: event.activityTypeKey ?? CALENDAR_OTHER_ACTIVITY_KEY,
    recurrenceFrequency: event.recurrence.frequency,
    recurrenceCustomUnit: event.recurrence.customUnit ?? "weekly",
    recurrenceInterval: event.recurrence.interval,
    recurrenceNeverEnds: event.recurrence.neverEnds ?? !event.recurrence.endDate,
    recurrenceEndDate: event.recurrence.endDate ?? "",
    reminderMinutes: event.reminderMinutes ?? [...DEFAULT_CALENDAR_REMINDER_MINUTES],
  };
}

export function expandedEventToFormValues(event: ExpandedCalendarEvent): EventFormValues {
  return {
    title: event.title,
    notes: event.notes ?? "",
    date: event.startAt.slice(0, 10),
    startTime: event.startAt.slice(11, 16),
    endTime: event.endAt.slice(11, 16),
    allDay: event.allDay,
    color: event.color,
    activityTypeKey: event.activityTypeKey ?? CALENDAR_OTHER_ACTIVITY_KEY,
    recurrenceFrequency: "none",
    recurrenceCustomUnit: "weekly",
    recurrenceInterval: 1,
    recurrenceNeverEnds: true,
    recurrenceEndDate: "",
    reminderMinutes: [...DEFAULT_CALENDAR_REMINDER_MINUTES],
  };
}

export function formValuesToPayload(values: EventFormValues) {
  const startAt = values.allDay ? `${values.date}T00:00` : `${values.date}T${values.startTime}`;
  const endAt = values.allDay ? `${values.date}T23:59` : `${values.date}T${values.endTime}`;

  return {
    title: values.title.trim(),
    notes: values.notes.trim() || undefined,
    startAt,
    endAt,
    allDay: values.allDay,
    color: values.color,
    activityTypeKey: values.activityTypeKey,
    recurrence: {
      frequency: values.recurrenceFrequency,
      interval: Math.max(1, values.recurrenceInterval),
      customUnit: values.recurrenceFrequency === "custom" ? values.recurrenceCustomUnit : undefined,
      neverEnds: values.recurrenceFrequency !== "none" ? values.recurrenceNeverEnds : undefined,
      endDate:
        values.recurrenceFrequency !== "none" && !values.recurrenceNeverEnds
          ? values.recurrenceEndDate || undefined
          : undefined,
    },
    reminderMinutes: values.reminderMinutes,
  };
}

export function validateEventFormValues(values: EventFormValues): string | null {
  if (!values.title.trim()) {
    return "請輸入標題";
  }
  if (!values.allDay && values.endTime <= values.startTime) {
    return "結束時間必須晚於開始時間";
  }
  if (
    values.recurrenceFrequency !== "none" &&
    !values.recurrenceNeverEnds &&
    values.recurrenceEndDate &&
    values.recurrenceEndDate < values.date
  ) {
    return "重複結束日不可早於開始日期";
  }
  return null;
}

export function addHoursToTime(time: string, hours: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + hours * 60;
  const capped = Math.min(totalMinutes, 23 * 60 + 59);
  const nextHour = Math.floor(capped / 60);
  const nextMinute = capped % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

type RecurrencePresetKey =
  | "none"
  | "daily"
  | "weekly"
  | "every_2_weeks"
  | "every_3_days"
  | "monthly"
  | "every_2_months";

const RECURRENCE_PRESETS: Array<{
  key: RecurrencePresetKey;
  label: string;
  frequency: RecurrenceFrequency;
  interval: number;
  customUnit?: EventFormValues["recurrenceCustomUnit"];
}> = [
  { key: "none", label: "不重複", frequency: "none", interval: 1 },
  { key: "daily", label: "每天", frequency: "daily", interval: 1 },
  { key: "weekly", label: "每週", frequency: "weekly", interval: 1 },
  { key: "every_2_weeks", label: "每 2 週", frequency: "custom", interval: 2, customUnit: "weekly" },
  { key: "every_3_days", label: "每 3 天", frequency: "custom", interval: 3, customUnit: "daily" },
  { key: "monthly", label: "每月", frequency: "monthly", interval: 1 },
  { key: "every_2_months", label: "每 2 個月", frequency: "custom", interval: 2, customUnit: "monthly" },
];

function getRecurrencePresetKey(values: EventFormValues): RecurrencePresetKey {
  if (values.recurrenceFrequency === "none") {
    return "none";
  }
  if (values.recurrenceFrequency === "daily" && values.recurrenceInterval === 1) {
    return "daily";
  }
  if (values.recurrenceFrequency === "weekly" && values.recurrenceInterval === 1) {
    return "weekly";
  }
  if (values.recurrenceFrequency === "monthly" && values.recurrenceInterval === 1) {
    return "monthly";
  }
  if (
    values.recurrenceFrequency === "custom" &&
    values.recurrenceCustomUnit === "weekly" &&
    values.recurrenceInterval === 2
  ) {
    return "every_2_weeks";
  }
  if (
    values.recurrenceFrequency === "custom" &&
    values.recurrenceCustomUnit === "daily" &&
    values.recurrenceInterval === 3
  ) {
    return "every_3_days";
  }
  if (
    values.recurrenceFrequency === "custom" &&
    values.recurrenceCustomUnit === "monthly" &&
    values.recurrenceInterval === 2
  ) {
    return "every_2_months";
  }
  return "weekly";
}

function applyRecurrencePreset(
  presetKey: RecurrencePresetKey,
  values: EventFormValues,
): EventFormValues {
  const preset = RECURRENCE_PRESETS.find((item) => item.key === presetKey);
  if (!preset) {
    return values;
  }
  return {
    ...values,
    recurrenceFrequency: preset.frequency,
    recurrenceInterval: preset.interval,
    recurrenceCustomUnit: preset.customUnit ?? values.recurrenceCustomUnit,
  };
}

function ActivityTypeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const dailyTypes = getCalendarDailyActivityTypes();
  const meetingTypes = getCalendarMeetingActivityTypes();
  const otherType = getCalendarSelectableActivityTypes().find(
    (type) => type.key === CALENDAR_OTHER_ACTIVITY_KEY,
  );

  return (
    <label className="block space-y-2">
      <span className="text-[0.875rem] font-medium text-[#636366]">行程種類</span>
      <select
        className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <optgroup label="日常">
          {dailyTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="會議">
          {meetingTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </optgroup>
        {otherType ? (
          <optgroup label="其他">
            <option value={otherType.key}>{otherType.label}</option>
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

export function EventFormModal({
  open,
  mode,
  values,
  readOnly = false,
  sharedContext,
  personalLogContext,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  mode: "create" | "edit" | "view";
  values: EventFormValues;
  readOnly?: boolean;
  sharedContext?: SharedEventFormContext;
  personalLogContext?: PersonalEventLogContext;
  onChange: (values: EventFormValues) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  const modalRootRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open, modalRootRef);

  if (!open) {
    return null;
  }

  const title =
    mode === "create" ? "新增行程" : mode === "view" ? "共用行程" : "編輯行程";

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden overscroll-none touch-none sm:items-center sm:p-4"
    >
      <button
        aria-label="關閉"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        type="button"
      />
      <div className="relative mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] flex w-full max-w-md max-h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] touch-auto flex-col overflow-hidden rounded-t-[1.75rem] bg-[var(--cal-surface)] shadow-xl sm:mb-0 sm:max-h-[90vh] sm:rounded-[1.75rem]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--cal-border)] px-6 py-4">
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{title}</h2>
          <button
            className="rounded-lg px-2 py-1 text-[0.9375rem] font-medium text-[var(--cal-primary-dark)]"
            onClick={onClose}
            type="button"
          >
            {readOnly ? "關閉" : "取消"}
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-6 py-4 [-webkit-overflow-scrolling:touch]">
        {readOnly ? (
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-[#86868b]">
            此行程來自共用行事曆，無法編輯內容。請選擇種類後按「會參加」，系統會列入統計並固定顯示在您的行事曆。
          </p>
        ) : null}

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">標題</span>
            <input
              className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--cal-primary)] disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
              disabled={readOnly}
              onChange={(event) => onChange({ ...values, title: event.target.value })}
              placeholder="行程名稱"
              value={values.title}
            />
          </label>

          <ActivityTypeSelect
            onChange={(activityTypeKey) => onChange({ ...values, activityTypeKey })}
            value={values.activityTypeKey}
          />

          <label className="flex items-center gap-3">
            <input
              checked={values.allDay}
              disabled={readOnly}
              onChange={(event) => onChange({ ...values, allDay: event.target.checked })}
              type="checkbox"
            />
            <span className="text-[0.9375rem] text-[#1d1d1f]">全天</span>
          </label>

          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">日期</span>
            <input
              className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
              disabled={readOnly}
              onChange={(event) => onChange({ ...values, date: event.target.value })}
              type="date"
              value={values.date}
            />
          </label>

          {!values.allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">開始</span>
                <input
                  className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
                  disabled={readOnly}
                  onChange={(event) => {
                    const startTime = event.target.value;
                    onChange({
                      ...values,
                      startTime,
                      endTime: addHoursToTime(startTime, 1),
                    });
                  }}
                  type="time"
                  value={values.startTime}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">結束</span>
                <input
                  className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
                  disabled={readOnly}
                  onChange={(event) => onChange({ ...values, endTime: event.target.value })}
                  type="time"
                  value={values.endTime}
                />
              </label>
            </div>
          ) : null}

          {!readOnly ? (
            <div>
              <p className="text-[0.875rem] font-medium text-[#636366]">顏色</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(CALENDAR_EVENT_COLORS) as CalendarEventColor[]).map((color) => (
                  <button
                    key={color}
                    aria-label={CALENDAR_EVENT_COLORS[color].label}
                    className={`h-8 w-8 rounded-full border-2 ${
                      values.color === color ? "border-[#1d1d1f]" : "border-transparent"
                    }`}
                    onClick={() => onChange({ ...values, color })}
                    style={{ backgroundColor: CALENDAR_EVENT_COLORS[color].bg }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!readOnly ? (
            <>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">重複</span>
                <select
                  className="w-full rounded-xl border border-[var(--cal-border)] px-3 py-2.5 text-[0.9375rem]"
                  onChange={(event) =>
                    onChange(
                      applyRecurrencePreset(event.target.value as RecurrencePresetKey, values),
                    )
                  }
                  value={getRecurrencePresetKey(values)}
                >
                  {RECURRENCE_PRESETS.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              {values.recurrenceFrequency !== "none" ? (
                <div className="space-y-3 rounded-xl bg-[var(--cal-primary-muted)] px-3 py-3">
                  <p className="text-[0.875rem] font-medium text-[#636366]">重複結束</p>
                  <label className="flex items-center gap-2">
                    <input
                      checked={values.recurrenceNeverEnds}
                      onChange={() => onChange({ ...values, recurrenceNeverEnds: true, recurrenceEndDate: "" })}
                      name="recurrence-end"
                      type="radio"
                    />
                    <span className="text-[0.875rem] text-[#1d1d1f]">永不結束（刪除行程才停止）</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      checked={!values.recurrenceNeverEnds}
                      onChange={() => onChange({ ...values, recurrenceNeverEnds: false })}
                      name="recurrence-end"
                      type="radio"
                    />
                    <span className="text-[0.875rem] text-[#1d1d1f]">結束於</span>
                  </label>
                  {!values.recurrenceNeverEnds ? (
                    <input
                      className="date-input"
                      onChange={(event) => onChange({ ...values, recurrenceEndDate: event.target.value })}
                      type="date"
                      value={values.recurrenceEndDate}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">備註</span>
            <textarea
              className="min-h-[4rem] w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 disabled:bg-[var(--cal-primary-muted)] disabled:text-[var(--cal-text)]"
              disabled={readOnly}
              onChange={(event) => onChange({ ...values, notes: event.target.value })}
              value={values.notes}
            />
          </label>

          <ReminderOptionsField
            helperText={
              readOnly
                ? "標記「會參加」後，系統會依這些時間推送手機通知（需允許通知權限）。"
                : "可複選多個提醒時間，儲存後會推送手機通知（需允許通知權限）。"
            }
            onChange={(reminderMinutes) => onChange({ ...values, reminderMinutes })}
            value={values.reminderMinutes}
          />
        </div>

        {sharedContext ? (
          <div className="mt-6 rounded-xl bg-[var(--cal-primary-muted)] px-4 py-3">
            <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">
              下線夥伴參加 {sharedContext.attendanceSummary.totalParticipants} 人
              {sharedContext.attendanceSummary.totalNewFriends > 0
                ? ` · 新朋友 ${sharedContext.attendanceSummary.totalNewFriends} 人`
                : ""}
            </p>
            {sharedContext.attendanceSummary.participants.length > 0 ? (
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto overscroll-contain text-[0.8125rem] text-[#636366]">
                {sharedContext.attendanceSummary.participants.map((participant) => (
                  <li key={participant.name} className="flex justify-between gap-2">
                    <span>{participant.name}</span>
                    {participant.newFriendsCount > 0 ? (
                      <span className="shrink-0 text-[var(--cal-primary-dark)]">
                        +{participant.newFriendsCount} 新朋友
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[0.8125rem] text-[#86868b]">尚無夥伴標記參加</p>
            )}
          </div>
        ) : null}
        </div>

        <div className="shrink-0 space-y-3 border-t border-[var(--cal-border)] bg-[var(--cal-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {sharedContext ? (
            <>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">帶幾位新朋友</span>
                <input
                  className="w-full rounded-xl border border-[var(--cal-border)] px-4 py-3 text-[1rem] outline-none focus:border-[var(--cal-primary)]"
                  min={0}
                  onChange={(event) =>
                    sharedContext.onNewFriendsCountChange(
                      Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                    )
                  }
                  type="number"
                  value={sharedContext.newFriendsCount}
                />
              </label>

              <button
                className={`w-full rounded-xl px-4 py-3.5 text-[1rem] font-semibold text-white ${
                  sharedContext.isAttending ? "bg-[var(--cal-primary-dark)]" : "bg-[var(--cal-primary)]"
                }`}
                onClick={() =>
                  sharedContext.onToggleAttend(
                    !sharedContext.isAttending,
                    values.activityTypeKey,
                    sharedContext.newFriendsCount,
                  )
                }
                type="button"
              >
                {sharedContext.isAttending
                  ? `已標記參加（新朋友 ${sharedContext.newFriendsCount} 人 · 點擊取消）`
                  : `會參加 · 帶 ${sharedContext.newFriendsCount} 位新朋友`}
              </button>
            </>
          ) : null}

          {!readOnly ? (
            <>
            {personalLogContext ? (
              <button
                className={`w-full rounded-xl px-4 py-3.5 text-[0.9375rem] font-semibold ${
                  personalLogContext.isLogged
                    ? "border border-[var(--cal-primary-dark)] bg-[var(--cal-primary-light)] text-[var(--cal-primary-dark)]"
                    : "border border-[var(--cal-border)] bg-[var(--cal-surface)] text-[#1d1d1f]"
                }`}
                disabled={personalLogContext.isLogged || personalLogContext.isLogging}
                onClick={personalLogContext.onLogActivity}
                type="button"
              >
                {personalLogContext.isLogged
                  ? "已登記至紀錄中心"
                  : personalLogContext.isLogging
                    ? "登記中…"
                    : "完成並登記至紀錄中心"}
              </button>
            ) : null}
            <button
              className="w-full rounded-xl bg-[var(--cal-primary)] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-50"
              disabled={!values.title.trim()}
              onClick={onSubmit}
              type="button"
            >
              {mode === "create" ? "新增" : "儲存"}
            </button>
            {mode === "edit" && onDelete ? (
              <button
                className="w-full rounded-xl border border-[#ff375f] px-4 py-3 text-[0.9375rem] font-semibold text-[#ff375f]"
                onClick={onDelete}
                type="button"
              >
                刪除行程
              </button>
            ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
