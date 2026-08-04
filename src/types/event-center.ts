import type { EntityId, ISODateString } from "./common";
import type { BakiEventCategory } from "./baki-event";

export interface EventTimelineEntry {
  id: string;
  eventTypeKey: string;
  category: BakiEventCategory;
  label: string;
  eventDate: ISODateString;
  subtitle: string;
  value: number | null;
}

export interface EventCenterResult {
  memberId: EntityId;
  referenceDate: ISODateString;
  events: EventTimelineEntry[];
  totalEventCount: number;
  computedAt: string;
}
