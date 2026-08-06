import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { CALENDAR_OTHER_ACTIVITY_KEY } from "@/lib/calendar/calendar-activity-types";
import { defaultRecurrence } from "@/lib/calendar/recurrence";
import { getPipelineStageDefinition } from "@/lib/retail-pipeline/pipeline-stages";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEventColor } from "@/types/calendar-event";
import type { RetailPipelineLead, RetailPipelineStageKey } from "@/types/retail-pipeline";

const DEFAULT_SCHEDULE_TIME = "10:00";
const STAGE_COLORS: Record<RetailPipelineStageKey, CalendarEventColor> = {
  stranger: "blue",
  measurement: "green",
  consultation: "purple",
  transaction: "orange",
  member: "teal",
  map: "red",
  supervisor: "orange",
  world_team: "green",
};

function resolveActivityTypeKey(stageKey: RetailPipelineStageKey): string {
  const stage = getPipelineStageDefinition(stageKey);
  return stage.entryEventTypeKey ?? CALENDAR_OTHER_ACTIVITY_KEY;
}

function buildCalendarTimes(
  scheduledDate: string,
  scheduledTime?: string,
): { startAt: string; endAt: string } {
  const time = scheduledTime?.trim() || DEFAULT_SCHEDULE_TIME;
  const startAt = `${scheduledDate}T${time}`;
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const endHour = hour + 1 >= 24 ? 23 : hour + 1;
  const endMinute = hour + 1 >= 24 ? 59 : minute;
  const endAt = `${scheduledDate}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
  return { startAt, endAt };
}

function buildCalendarTitle(lead: RetailPipelineLead): string {
  const stage = getPipelineStageDefinition(lead.stageKey);
  return `${stage.title} · ${lead.displayName}`;
}

function buildCalendarNotes(lead: RetailPipelineLead): string {
  const parts = ["名單流程"];
  if (lead.region) {
    parts.push(`地區：${lead.region}`);
  }
  parts.push(`leadId:${lead.id}`);
  return parts.join(" · ");
}

export function syncPipelineLeadCalendarEvent(
  lead: RetailPipelineLead,
  storage: StorageAdapter,
): string | undefined {
  if (!lead.scheduledDate) {
    if (lead.calendarEventId) {
      createCalendarEventRepository(storage).delete(lead.calendarEventId);
    }
    return undefined;
  }

  const memberId = resolveAuthenticatedMemberId(storage);
  const repository = createCalendarEventRepository(storage);
  const { startAt, endAt } = buildCalendarTimes(lead.scheduledDate, lead.scheduledTime);
  const payload = {
    title: buildCalendarTitle(lead),
    notes: buildCalendarNotes(lead),
    startAt,
    endAt,
    allDay: false,
    color: STAGE_COLORS[lead.stageKey],
    recurrence: defaultRecurrence(),
    activityTypeKey: resolveActivityTypeKey(lead.stageKey),
  };

  if (lead.calendarEventId) {
    const existing = repository.getById(lead.calendarEventId);
    if (existing) {
      repository.update(lead.calendarEventId, payload);
      return lead.calendarEventId;
    }
  }

  const created = repository.create({
    memberId,
    ...payload,
  });
  return created.id;
}

export function removePipelineLeadCalendarEvent(
  lead: RetailPipelineLead,
  storage: StorageAdapter,
): void {
  if (!lead.calendarEventId) {
    return;
  }
  createCalendarEventRepository(storage).delete(lead.calendarEventId);
}
