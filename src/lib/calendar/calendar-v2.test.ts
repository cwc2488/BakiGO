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
  layoutTimedEvents,
  TIMED_EVENT_MAX_VISIBLE_COLUMNS,
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

  it("lays out a single event at full width", () => {
    const { layouts } = layoutTimedEvents(
      [makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` })],
      day,
      60,
    );
    expect(layouts).toHaveLength(1);
    expect(layouts[0].widthPercent).toBe(100);
    expect(layouts[0].leftPercent).toBe(0);
  });

  it("lays out two overlapping events side by side", () => {
    const { layouts } = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
      ],
      day,
      60,
    );
    expect(layouts).toHaveLength(2);
    expect(layouts[0].maxConcurrent).toBe(2);
    expect(layouts[1].maxConcurrent).toBe(2);
    expect(layouts[0].widthPercent + layouts[1].widthPercent).toBeCloseTo(100, 1);
  });

  it("reclaims width after partial overlap ends", () => {
    const { layouts } = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T21:00` }),
        makeExpandedEvent({ occurrenceId: "c", title: "C", startAt: `${day}T19:30`, endAt: `${day}T20:30` }),
        makeExpandedEvent({ occurrenceId: "d", title: "D", startAt: `${day}T20:00`, endAt: `${day}T21:00` }),
      ],
      day,
      60,
    );
    const eventD = layouts.find((layout) => layout.event.occurrenceId === "d");
    expect(eventD).toBeDefined();
    expect(eventD!.maxConcurrent).toBeLessThan(4);
    expect(eventD!.widthPercent).toBeGreaterThan(25);
  });

  it("does not assign four equal columns for the canonical overlap example", () => {
    const { layouts } = layoutTimedEvents(
      [
        makeExpandedEvent({ occurrenceId: "a", title: "A", startAt: `${day}T19:00`, endAt: `${day}T20:00` }),
        makeExpandedEvent({ occurrenceId: "b", title: "B", startAt: `${day}T19:00`, endAt: `${day}T21:00` }),
        makeExpandedEvent({ occurrenceId: "c", title: "C", startAt: `${day}T19:30`, endAt: `${day}T20:30` }),
        makeExpandedEvent({ occurrenceId: "d", title: "D", startAt: `${day}T20:00`, endAt: `${day}T21:00` }),
      ],
      day,
      60,
    );
    const maxConcurrentValues = layouts.map((layout) => layout.maxConcurrent);
    expect(Math.max(...maxConcurrentValues)).toBeLessThan(4);
  });

  it("collapses 5+ concurrent events into overflow clusters", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      makeExpandedEvent({
        occurrenceId: `e${index}`,
        title: `Event ${index}`,
        startAt: `${day}T19:00`,
        endAt: `${day}T20:00`,
      }),
    );
    const { layouts, overflowClusters } = layoutTimedEvents(events, day, 60);
    expect(layouts.length).toBeLessThan(5);
    expect(overflowClusters.length).toBeGreaterThan(0);
    expect(overflowClusters[0].events.length).toBeGreaterThan(0);
    expect(TIMED_EVENT_MAX_VISIBLE_COLUMNS).toBe(3);
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
