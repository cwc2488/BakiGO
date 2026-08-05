import type { BakiEvent } from "@/types/baki-event";
import type { EventCenterResult, EventTimelineEntry } from "@/types/event-center";
import type { EntityId, ISODateString } from "@/types";
import { getEventTypeDefinition } from "@/lib/event-center/event-types";

function buildTimelineSubtitle(event: BakiEvent): string {
  if (event.eventCategory === "transaction") {
    const customerName =
      typeof event.metadata?.customerName === "string" ? event.metadata.customerName : "—";
    const currencyCode =
      typeof event.metadata?.currencyCode === "string" ? event.metadata.currencyCode : "";
    const unit = currencyCode === "VP" || event.eventTypeKey.includes("_vp") ? "VP" : "NT$";
    return `${customerName} · ${event.value ?? 0} ${unit}`;
  }

  if (typeof event.metadata?.note === "string" && event.metadata.note.trim()) {
    return event.metadata.note.trim();
  }

  const metadata = event.metadata as { calendarTitle?: string; source?: string } | undefined;
  if (metadata?.source === "calendar" && metadata.calendarTitle?.trim()) {
    return `${metadata.calendarTitle.trim()} · 來自行事曆`;
  }

  return getEventTypeDefinition(event.eventTypeKey)?.description ?? event.eventTypeKey;
}

function toTimelineEntry(event: BakiEvent): EventTimelineEntry {
  const definition = getEventTypeDefinition(event.eventTypeKey);

  return {
    id: event.id,
    eventTypeKey: event.eventTypeKey,
    category: event.eventCategory,
    label: definition?.label ?? event.eventTypeKey,
    eventDate: event.eventDate,
    subtitle: buildTimelineSubtitle(event),
    value: event.value ?? null,
  };
}

export interface BuildEventTimelineInput {
  memberId: EntityId;
  referenceDate: ISODateString;
  events: BakiEvent[];
}

export function buildEventTimeline(input: BuildEventTimelineInput): EventCenterResult {
  const memberEvents = input.events
    .filter((event) => event.memberId === input.memberId)
    .map(toTimelineEntry)
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));

  return {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    events: memberEvents,
    totalEventCount: memberEvents.length,
    computedAt: new Date().toISOString(),
  };
}
