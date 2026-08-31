import { describe, expect, it } from "vitest";
import {
  CALENDAR_CATEGORIES,
  getCalendarCategoryDefaultColor,
  getCalendarCategoryLabel,
  isLegacyMeetingActivityKey,
  normalizeCalendarCategoryKeyForSave,
  resolveCalendarCategoryKey,
  CALENDAR_CATEGORY_KEYS,
} from "@/lib/calendar/calendar-categories";
import {
  formValuesToPayload,
  buildDefaultFormValues,
  eventToFormValues,
  expandedEventToFormValues,
} from "@/components/calendar/EventFormModal";
import {
  getEventCardDensity,
  groupLayoutSegmentsByEvent,
  layoutTimedEvents,
  TIMED_EVENT_MIN_TAP_WIDTH_PX,
  TIMED_EVENT_MOBILE_TRACK_PX,
} from "@/lib/calendar/time-grid";
import {
  CALENDAR_EVENT_COLOR_OPTIONS,
  normalizeCalendarEventColor,
  type CalendarEvent,
  type ExpandedCalendarEvent,
} from "@/types/calendar-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function makeExpandedEvent(input: Partial<ExpandedCalendarEvent> & Pick<ExpandedCalendarEvent, "occurrenceId" | "startAt" | "endAt" | "title">): ExpandedCalendarEvent {
  return {
    sourceEventId: "evt-1",
    occurrenceDate: input.startAt.slice(0, 10),
    allDay: false,
    color: "green",
    isRecurringInstance: false,
    ...input,
  };
}

describe("Calendar V2 — categories", () => {
  it("exposes exactly four selectable categories", () => {
    expect(CALENDAR_CATEGORIES.map((item) => item.label)).toEqual([
      "會議",
      "諮詢",
      "教練課",
      "量測",
    ]);
  });

  it("maps legacy meeting subtypes to 會議 without data loss key", () => {
    expect(isLegacyMeetingActivityKey("hom")).toBe(true);
    expect(getCalendarCategoryLabel("hom")).toBe("會議");
    expect(resolveCalendarCategoryKey("hom")).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
    expect(resolveCalendarCategoryKey("nutrition_class")).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
  });

  it("normalizes save payload to canonical category keys", () => {
    expect(normalizeCalendarCategoryKeyForSave("hom")).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
    expect(normalizeCalendarCategoryKeyForSave("consultation")).toBe(CALENDAR_CATEGORY_KEYS.CONSULTATION);
  });

  it("creates events for each of the four categories", () => {
    for (const key of Object.values(CALENDAR_CATEGORY_KEYS)) {
      const values = {
        ...buildDefaultFormValues("2026-08-31"),
        title: `Test ${key}`,
        activityTypeKey: key,
        color: getCalendarCategoryDefaultColor(key),
      };
      const payload = formValuesToPayload(values);
      expect(payload.activityTypeKey).toBe(key);
      expect(payload.title).toBe(`Test ${key}`);
    }
  });

  it("editing legacy event shows 會議 category without corrupting title", () => {
    const legacy: CalendarEvent = {
      id: "1",
      memberId: "m1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      title: "台中 HOM",
      startAt: "2026-08-31T19:00",
      endAt: "2026-08-31T20:00",
      allDay: false,
      color: "green",
      recurrence: { frequency: "none", interval: 1 },
      activityTypeKey: "hom",
    };
    const form = eventToFormValues(legacy);
    expect(form.activityTypeKey).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
    expect(form.title).toBe("台中 HOM");
    const saved = formValuesToPayload({ ...form, title: "台中 HOM 更新" });
    expect(saved.activityTypeKey).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
  });
});

describe("Calendar V2 — colors", () => {
  it("provides 12 curated palette colors in the form", () => {
    expect(CALENDAR_EVENT_COLOR_OPTIONS).toHaveLength(12);
  });

  it("persists custom palette color in payload", () => {
    const values = {
      ...buildDefaultFormValues("2026-08-31"),
      title: "Color test",
      color: "lavender" as const,
      activityTypeKey: CALENDAR_CATEGORY_KEYS.CONSULTATION,
    };
    expect(formValuesToPayload(values).color).toBe("lavender");
  });

  it("falls back to category default when color missing", () => {
    const color = normalizeCalendarEventColor(undefined, getCalendarCategoryDefaultColor("consultation"));
    expect(color).toBe("purple");
  });

  it("preserves existing event color", () => {
    const event: CalendarEvent = {
      id: "1",
      memberId: "m1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      title: "Colored",
      startAt: "2026-08-31T10:00",
      endAt: "2026-08-31T11:00",
      allDay: false,
      color: "indigo",
      recurrence: { frequency: "none", interval: 1 },
      activityTypeKey: "meeting",
    };
    expect(eventToFormValues(event).color).toBe("indigo");
  });

  it("normalizes legacy red to rose", () => {
    expect(normalizeCalendarEventColor("red")).toBe("rose");
  });
});

describe("Calendar V2 — overlap layout", () => {
  const day = "2026-08-31";

  function uniqueEventIds(result: ReturnType<typeof layoutTimedEvents>): string[] {
    return [...new Set(result.segments.map((segment) => segment.event.occurrenceId))];
  }

  it("lays out a single event at full width", () => {
    const result = layoutTimedEvents(
      [makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` })],
      day,
      60,
    );
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].widthPercent).toBe(100);
    expect(result.segments[0].leftPercent).toBe(0);
  });

  it("lays out two overlapping events side by side", () => {
    const result = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
      ],
      day,
      60,
    );
    expect(uniqueEventIds(result)).toHaveLength(2);
    expect(result.overflowClusters).toHaveLength(0);
    const widths = result.segments.map((segment) => segment.widthPercent);
    expect(widths.every((width) => width === 50)).toBe(true);
  });

  it("reclaims width after partial overlap ends via segment width changes", () => {
    const result = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T21:00` }),
        makeExpandedEvent({ occurrenceId: "c", title: "C", startAt: `${day}T19:30`, endAt: `${day}T20:30` }),
        makeExpandedEvent({ occurrenceId: "d", title: "D", startAt: `${day}T20:00`, endAt: `${day}T21:00` }),
      ],
      day,
      60,
    );
    const eventDSegments = result.segments.filter((segment) => segment.event.occurrenceId === "d");
    expect(eventDSegments.length).toBeGreaterThan(0);
    expect(eventDSegments.some((segment) => segment.widthPercent > 25)).toBe(true);
  });

  it("renders all five events inline for the real-world evening overlap pattern", () => {
    const result = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "台中 HOM", startAt: `${day}T19:00`, endAt: `${day}T21:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "純伶", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "c", title: "幸芬", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({
          occurrenceId: "d",
          title: "中壢商機-肇銘推廣",
          startAt: `${day}T19:30`,
          endAt: `${day}T21:30`,
        }),
        makeExpandedEvent({ occurrenceId: "e", title: "美珠姐", startAt: `${day}T20:00`, endAt: `${day}T21:00` }),
      ],
      day,
      60,
    );

    expect(uniqueEventIds(result)).toHaveLength(5);
    expect(result.overflowClusters).toHaveLength(0);
    expect(result.segments.some((segment) => segment.event.title === "中壢商機-肇銘推廣")).toBe(true);

    const at1930 = result.segments.filter(
      (segment) => segment.event.startAt <= `${day}T19:30` && segment.event.endAt > `${day}T19:30`,
    );
    expect(new Set(at1930.map((segment) => segment.event.occurrenceId)).size).toBeGreaterThanOrEqual(4);
  });

  it("renders 2 through 6 simultaneous events inline without overflow", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const events = Array.from({ length: count }, (_, index) =>
        makeExpandedEvent({
          occurrenceId: `e${index}`,
          title: `Event ${index}`,
          startAt: `${day}T19:00`,
          endAt: `${day}T20:00`,
        }),
      );
      const result = layoutTimedEvents(events, day, 60);
      expect(uniqueEventIds(result)).toHaveLength(count);
      expect(result.overflowClusters).toHaveLength(0);
    }
  });

  it("uses compact card density for narrow overlap columns", () => {
    const result = layoutTimedEvents(
      Array.from({ length: 5 }, (_, index) =>
        makeExpandedEvent({
          occurrenceId: `e${index}`,
          title: `Event ${index}`,
          startAt: `${day}T19:00`,
          endAt: `${day}T20:00`,
        }),
      ),
      day,
      60,
    );
    const densities = result.segments.map((segment) => getEventCardDensity(segment.widthPercent));
    expect(densities.every((density) => density === "narrow" || density === "minimal")).toBe(true);
  });

  it("only overflows when cards would be narrower than the tap threshold", () => {
    const extremeCount = Math.ceil(TIMED_EVENT_MOBILE_TRACK_PX / TIMED_EVENT_MIN_TAP_WIDTH_PX) + 1;
    const events = Array.from({ length: extremeCount }, (_, index) =>
      makeExpandedEvent({
        occurrenceId: `x${index}`,
        title: `Extreme ${index}`,
        startAt: `${day}T19:00`,
        endAt: `${day}T20:00`,
      }),
    );
    const result = layoutTimedEvents(events, day, 60);
    expect(result.overflowClusters.length).toBeGreaterThan(0);
    expect(uniqueEventIds(result).length).toBeLessThan(extremeCount);
  });

  it("produces deterministic layout across repeated calls", () => {
    const events = [
      makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
      makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:15`, endAt: `${day}T20:15` }),
      makeExpandedEvent({ occurrenceId: "c", title: "C", startAt: `${day}T19:30`, endAt: `${day}T20:30` }),
    ];
    const first = layoutTimedEvents(events, day, 60);
    const second = layoutTimedEvents(events, day, 60);
    expect(first).toEqual(second);
  });

  it("groups segments by event for rendering", () => {
    const events = [
      makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T21:00` }),
      makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
      makeExpandedEvent({ occurrenceId: "c", title: "C", startAt: `${day}T19:30`, endAt: `${day}T21:30` }),
    ];
    const { segments } = layoutTimedEvents(events, day, 60);
    const groups = groupLayoutSegmentsByEvent(segments);
    expect(groups.size).toBe(3);
    expect(groups.get("a")!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Calendar V2 — recurring scroll safety", () => {
  it("hides EventForm while RecurrenceScope is open (single scroll lock)", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("open={formOpen && recurrenceScopeMode === null}");
    expect(page).toContain("<RecurrenceScopeModal");
  });

  it("resets calendar interaction after modal close", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("resetCalendarInteraction");
    expect(page).toContain("interactionResetKey");
  });

  it("expanded recurring instance form does not carry recurrence into save payload", () => {
    const expanded = makeExpandedEvent({
      occurrenceId: "occ-1",
      title: "Weekly",
      startAt: "2026-08-31T10:00",
      endAt: "2026-08-31T11:00",
      isRecurringInstance: true,
    });
    const form = expandedEventToFormValues(expanded);
    expect(form.recurrenceFrequency).toBe("none");
    expect(formValuesToPayload(form).recurrence.frequency).toBe("none");
  });
});

describe("Calendar V2 — UI form", () => {
  it("does not expose meeting subtype options in the form", () => {
    const form = src("src/components/calendar/EventFormModal.tsx");
    expect(form).not.toContain("getCalendarMeetingActivityTypes");
    expect(form).not.toContain('optgroup label="會議"');
    expect(form).toContain("事件分類");
    expect(form).toContain("事件顏色");
  });
});
