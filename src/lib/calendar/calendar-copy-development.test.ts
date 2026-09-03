import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDefaultFormValues,
  eventToFormValues,
  formValuesToPayload,
} from "@/components/calendar/EventFormModal";
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_KEYS,
  getCalendarCategoryDefaultColor,
  getCalendarCategoryLabel,
  normalizeCalendarCategoryKeyForSave,
  resolveCalendarCategoryKey,
} from "@/lib/calendar/calendar-categories";
import {
  completeCalendarActivityEvent,
  ensureScheduledConsultationCalendarEvent,
  isRecordableCalendarActivityKey,
  syncPersonalCalendarEventToBakiEvent,
} from "@/lib/calendar/calendar-baki-event-sync";
import { buildCopiedEventPayloads } from "@/lib/calendar/copy-event-to-dates";
import { ACTIVITY_LIFECYCLE_STATUS } from "@/lib/event-center/activity-lifecycle";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

class MemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const memberId = "member-copy-dev";

describe("COPY — restore multi-date copy event", () => {
  it("COPY-01: personal edit mode wires 複製事件 action", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    const form = src("src/components/calendar/EventFormModal.tsx");
    expect(page).toContain("CopyEventDatesSheet");
    expect(page).toContain("buildCopiedEventPayloads");
    expect(page).toContain("onCopy={formMode === \"edit\" && !formReadOnly");
    expect(form).toContain("複製事件");
    expect(form).toContain("onCopy");
  });

  it("COPY-02: shared/read-only events do not get onCopy", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    // Copy only when editable personal edit — not view/readOnly shared.
    expect(page).toContain("onCopy={formMode === \"edit\" && !formReadOnly ? () => setCopyOpen(true) : undefined}");
    expect(page).not.toMatch(/onCopy=\{formMode === "view"/);
  });

  it("COPY-03: tapping 複製 opens date sheet; payloads alone do not persist", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("setCopyOpen(true)");
    expect(page).toContain("handleCopyToDates");
    // Sheet confirm is what creates — opening copy must not call repository.create inline.
    const openHandler = page.match(/onCopy=\{formMode === "edit" && !formReadOnly \? \(\) => setCopyOpen\(true\) : undefined\}/);
    expect(openHandler).toBeTruthy();
  });

  it("COPY-04: copy preserves title/notes/time/category/reminders/color", () => {
    const source = {
      ...buildDefaultFormValues("2026-09-01", "14:00"),
      title: "開發面談",
      notes: "新客跟進",
      endTime: "15:30",
      color: "lavender" as const,
      activityTypeKey: CALENDAR_CATEGORY_KEYS.CONSULTATION,
      reminderMinutes: [10, 60],
      allDay: false,
    };
    const payloads = buildCopiedEventPayloads(source, ["2026-09-08"]);
    expect(payloads).toHaveLength(1);
    const payload = payloads[0]!;
    expect(payload.title).toBe("開發面談");
    expect(payload.notes).toBe("新客跟進");
    expect(payload.startAt).toBe("2026-09-08T14:00");
    expect(payload.endAt).toBe("2026-09-08T15:30");
    expect(payload.activityTypeKey).toBe(CALENDAR_CATEGORY_KEYS.CONSULTATION);
    expect(payload.color).toBe("lavender");
    expect(payload.reminderMinutes).toEqual([10, 60]);
  });

  it("COPY-05 / COPY-06: saved copies get NEW ids; original unchanged", () => {
    const storage = new MemoryStorage();
    const repository = createCalendarEventRepository(storage);
    const original = repository.create({
      memberId,
      title: "原行程",
      notes: "keep me",
      startAt: "2026-09-01T10:00",
      endAt: "2026-09-01T11:00",
      color: "green",
      activityTypeKey: CALENDAR_CATEGORY_KEYS.MEETING,
      reminderMinutes: [15],
    });
    const form = eventToFormValues(original);
    const payloads = buildCopiedEventPayloads(form, ["2026-09-03", "2026-09-05"]);
    const created = payloads.map((payload) => repository.create({ memberId, ...payload }));

    expect(created).toHaveLength(2);
    expect(created[0]!.id).not.toBe(original.id);
    expect(created[1]!.id).not.toBe(original.id);
    expect(created[0]!.id).not.toBe(created[1]!.id);

    const reloaded = repository.getById(original.id)!;
    expect(reloaded.title).toBe("原行程");
    expect(reloaded.notes).toBe("keep me");
    expect(reloaded.startAt).toBe("2026-09-01T10:00");
    expect(repository.getByMemberId(memberId)).toHaveLength(3);
  });

  it("COPY-07: Google external identity is not copied into create payload", () => {
    const source = {
      ...buildDefaultFormValues("2026-09-01", "09:00"),
      title: "Synced",
    };
    const payload = buildCopiedEventPayloads(source, ["2026-09-02"])[0]!;
    expect(payload).not.toHaveProperty("googleEventId");
    expect(payload).not.toHaveProperty("googleCalendarId");
    expect(payload).not.toHaveProperty("id");
  });

  it("COPY-08 / COPY-09: completed consultation copy is scheduled, KPI unchanged until complete", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.bakiEvents, "[]");
    const calRepo = createCalendarEventRepository(storage);

    const original = calRepo.create({
      memberId,
      title: "完成過的諮詢",
      startAt: "2026-09-01T10:00",
      endAt: "2026-09-01T11:00",
      color: "purple",
      activityTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
    });
    ensureScheduledConsultationCalendarEvent(storage, memberId, original, "2026-09-01");
    completeCalendarActivityEvent(storage, memberId, original, "2026-09-01");

    const before = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      before.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(1);

    const form = eventToFormValues(original);
    const payload = buildCopiedEventPayloads(form, ["2026-09-10"])[0]!;
    const copy = calRepo.create({ memberId, ...payload });
    expect(copy.id).not.toBe(original.id);
    ensureScheduledConsultationCalendarEvent(storage, memberId, copy, "2026-09-10");

    const afterCopy = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      afterCopy.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(1);

    const linked = createEventRepository(storage)
      .getByMemberId(memberId)
      .filter((event) => event.metadata?.calendarEventId === copy.id);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.SCHEDULED);
    expect(linked[0]?.metadata?.lifecycleStatus).not.toBe(ACTIVITY_LIFECYCLE_STATUS.COMPLETED);
  });

  it("COPY-10: recurring source copies as single non-recurring events", () => {
    const source = {
      ...buildDefaultFormValues("2026-09-01", "10:00"),
      title: "週會",
      recurrenceFrequency: "weekly" as const,
      recurrenceNeverEnds: true,
      recurrenceInterval: 1,
    };
    const payloads = buildCopiedEventPayloads(source, ["2026-09-08", "2026-09-15"]);
    expect(payloads).toHaveLength(2);
    for (const payload of payloads) {
      expect(payload.recurrence.frequency).toBe("none");
      expect(payload.recurrence.neverEnds).toBeUndefined();
    }
  });

  it("COPY-11: participant list is cleared (not in create payload)", () => {
    const source = {
      ...buildDefaultFormValues("2026-09-01", "10:00"),
      title: "有參與者",
    };
    const payload = buildCopiedEventPayloads(source, ["2026-09-02"])[0]!;
    expect(payload).not.toHaveProperty("participantCustomerIds");

    const storage = new MemoryStorage();
    const repository = createCalendarEventRepository(storage);
    const withParticipants = repository.create({
      memberId,
      title: "有參與者",
      startAt: "2026-09-01T10:00",
      endAt: "2026-09-01T11:00",
      color: "green",
      activityTypeKey: CALENDAR_CATEGORY_KEYS.MEETING,
      participantCustomerIds: ["cust-a", "cust-b"],
    });
    const form = eventToFormValues(withParticipants);
    const copyPayload = buildCopiedEventPayloads(form, ["2026-09-03"])[0]!;
    const copy = repository.create({ memberId, ...copyPayload });
    expect(copy.participantCustomerIds ?? []).toEqual([]);
    expect(withParticipants.participantCustomerIds).toEqual(["cust-a", "cust-b"]);
  });
});

describe("CATEGORY — 開發 calendar category", () => {
  it("CATEGORY-01: 開發 appears in category selector list", () => {
    expect(CALENDAR_CATEGORIES.map((c) => c.label)).toContain("開發");
    expect(CALENDAR_CATEGORIES.map((c) => c.key)).toContain("development");
    const form = src("src/components/calendar/EventFormModal.tsx");
    expect(form).toContain("getCalendarSelectableCategories");
  });

  it("CATEGORY-02: development saves and reloads correctly", () => {
    const storage = new MemoryStorage();
    const repository = createCalendarEventRepository(storage);
    const values = {
      ...buildDefaultFormValues("2026-09-02", "16:00"),
      title: "開發：新名單",
      activityTypeKey: CALENDAR_CATEGORY_KEYS.DEVELOPMENT,
      color: getCalendarCategoryDefaultColor(CALENDAR_CATEGORY_KEYS.DEVELOPMENT),
    };
    const payload = formValuesToPayload(values);
    expect(payload.activityTypeKey).toBe("development");
    const created = repository.create({ memberId, ...payload });
    const reloaded = repository.getById(created.id)!;
    expect(reloaded.activityTypeKey).toBe("development");
    expect(eventToFormValues(reloaded).activityTypeKey).toBe(CALENDAR_CATEGORY_KEYS.DEVELOPMENT);
    expect(normalizeCalendarCategoryKeyForSave("development")).toBe(
      CALENDAR_CATEGORY_KEYS.DEVELOPMENT,
    );
  });

  it("CATEGORY-03: development label/color correct", () => {
    expect(getCalendarCategoryLabel("development")).toBe("開發");
    expect(getCalendarCategoryDefaultColor("development")).toBe("teal");
    expect(resolveCalendarCategoryKey("development")).toBe(CALENDAR_CATEGORY_KEYS.DEVELOPMENT);
  });

  it("CATEGORY-04 / CATEGORY-05: development does NOT count as consultation or measurement", () => {
    expect(isRecordableCalendarActivityKey(CALENDAR_CATEGORY_KEYS.DEVELOPMENT)).toBe(false);

    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.bakiEvents, "[]");
    const event: CalendarEvent = {
      id: "cal-dev-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      memberId,
      title: "開發行程",
      startAt: "2026-09-02T10:00",
      endAt: "2026-09-02T11:00",
      allDay: false,
      color: "teal",
      recurrence: { frequency: "none", interval: 1 },
      activityTypeKey: CALENDAR_CATEGORY_KEYS.DEVELOPMENT,
    };

    expect(ensureScheduledConsultationCalendarEvent(storage, memberId, event, "2026-09-02")).toBeNull();
    expect(syncPersonalCalendarEventToBakiEvent(storage, memberId, event, "2026-09-02")).toBeNull();
    expect(completeCalendarActivityEvent(storage, memberId, event, "2026-09-02")).toBeNull();

    const projected = projectEventsForEngines(createEventRepository(storage).getAll());
    expect(
      projected.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION),
    ).toHaveLength(0);
    expect(
      projected.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.MEASUREMENT),
    ).toHaveLength(0);
    expect(createEventRepository(storage).getByMemberId(memberId)).toHaveLength(0);
  });
});

describe("REGRESSION — copy/development must not break baselines", () => {
  it("REGRESSION-01: consultation one-tap markers remain", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("完成諮詢");
    expect(page).toContain("isConsultationActivity");
    expect(page).not.toContain('kind === "measurement" || kind === "consultation"');
  });

  it("REGRESSION-02..04: meeting / measurement / coach_class keys unchanged", () => {
    expect(CALENDAR_CATEGORY_KEYS.MEETING).toBe("meeting");
    expect(CALENDAR_CATEGORY_KEYS.MEASUREMENT).toBe("measurement");
    expect(CALENDAR_CATEGORY_KEYS.COACH_CLASS).toBe("coach_class");
    expect(CALENDAR_CATEGORY_KEYS.CONSULTATION).toBe("consultation");
  });

  it("REGRESSION-05: edit/delete wiring still present", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("onDelete={formMode === \"edit\"");
    expect(page).toContain("finalizeDelete");
    expect(page).toContain("finalizeEdit");
  });

  it("REGRESSION-06: shared calendar markers remain", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("showSharedCalendar");
    expect(page).toContain("loadSharedCalendarEvents");
    expect(page).toContain('formMode === "view"');
  });

  it("REGRESSION-07..09: Radar / Home / Customer baseline markers", () => {
    const hubItems = src("src/lib/customers/customer-journey-hub-items.ts");
    expect(hubItems).toContain('href: "/radar"');
    expect(hubItems).toContain("智慧找人");
    expect(hubItems).not.toContain("智慧找人（開發中）");

    expect(src("src/app/radar/page.tsx").length).toBeGreaterThan(20);
    expect(src("src/components/home/HomePage.tsx").length).toBeGreaterThan(500);
    expect(src("src/lib/home/my-home-presentation.ts").length).toBeGreaterThan(100);
    expect(src("src/components/customers/CustomerJourneyHubPage.tsx")).toContain("我的名單");
  });
});
