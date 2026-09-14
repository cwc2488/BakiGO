import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mergeCalendarEventDeletionTombstonesOnLogin,
  mergeCalendarEventsOnLogin,
} from "@/lib/calendar/calendar-event-deletion-tombstones";
import type { CalendarEvent } from "@/types/calendar-event";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "updatedAt">): CalendarEvent {
  return {
    id: partial.id,
    createdAt: partial.createdAt ?? "2026-09-01T00:00:00.000Z",
    updatedAt: partial.updatedAt,
    memberId: partial.memberId ?? "member-1",
    title: partial.title,
    startAt: partial.startAt ?? "2026-09-12T15:00:00.000Z",
    endAt: partial.endAt ?? "2026-09-12T16:00:00.000Z",
    allDay: false,
    color: partial.color ?? "teal",
    recurrence: { frequency: "none", interval: 1 },
  };
}

describe("personal calendar cross-device merge", () => {
  it("keeps newer cloud edits and adds cloud-only events", () => {
    const local = [
      event({ id: "e1", title: "舊標題", updatedAt: "2026-09-10T10:00:00.000Z" }),
    ];
    const cloud = [
      event({ id: "e1", title: "教練課", updatedAt: "2026-09-11T10:00:00.000Z" }),
      event({ id: "e2", title: "新事件", updatedAt: "2026-09-11T11:00:00.000Z" }),
    ];

    const merged = mergeCalendarEventsOnLogin(
      JSON.stringify(local),
      JSON.stringify(cloud),
      new Set(),
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.id === "e1")?.title).toBe("教練課");
    expect(merged.find((row) => row.id === "e2")?.title).toBe("新事件");
  });

  it("does not resurrect locally-present events that cloud tombstoned", () => {
    const local = [
      event({ id: "deleted-on-tablet", title: "應消失", updatedAt: "2026-09-10T10:00:00.000Z" }),
      event({ id: "keep", title: "保留", updatedAt: "2026-09-10T10:00:00.000Z" }),
    ];
    const cloud = [
      event({ id: "keep", title: "保留", updatedAt: "2026-09-10T10:00:00.000Z" }),
    ];
    const tombstones = mergeCalendarEventDeletionTombstonesOnLogin(
      null,
      JSON.stringify([{ eventId: "deleted-on-tablet", deletedAt: "2026-09-11T12:00:00.000Z" }]),
    );
    const tombstoneIds = new Set(tombstones.map((row) => row.eventId));

    const merged = mergeCalendarEventsOnLogin(
      JSON.stringify(local),
      JSON.stringify(cloud),
      tombstoneIds,
    );

    expect(merged.map((row) => row.id)).toEqual(["keep"]);
    expect(tombstoneIds.has("deleted-on-tablet")).toBe(true);
  });

  it("unions tombstones from both devices", () => {
    const merged = mergeCalendarEventDeletionTombstonesOnLogin(
      JSON.stringify([{ eventId: "a", deletedAt: "2026-09-10T00:00:00.000Z" }]),
      JSON.stringify([{ eventId: "b", deletedAt: "2026-09-11T00:00:00.000Z" }]),
    );
    expect(new Set(merged.map((row) => row.eventId))).toEqual(new Set(["a", "b"]));
  });
});

describe("personal calendar cross-device sync wiring", () => {
  it("CalendarPage soft-reloads after cloud hydration (does not block first paint)", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("awaitCloudAuthBackgroundSync");
    expect(page).toContain("cloudSyncVersion");
    expect(page).toContain("reloadEvents()");
    expect(page).toMatch(/await awaitCloudAuthBackgroundSync\(\);\s*[\s\S]*reloadEvents\(\)/);
  });

  it("login sync merges calendar tombstones before events", () => {
    const sync = src("src/lib/cloud/sync-app-data-on-login.ts");
    expect(sync).toContain("hydrateCalendarEventsFromCloud");
    expect(sync).toContain("mergeCalendarEventDeletionTombstonesOnLogin");
    expect(sync).toContain("mergeCalendarEventsOnLogin");
    expect(sync).toMatch(
      /mergeCalendarEventDeletionTombstonesOnLogin[\s\S]*mergeCalendarEventsOnLogin/,
    );
  });

  it("background sync version bumps on completion so UI can refresh", () => {
    const cloudSync = src("src/lib/auth/cloud-sync.ts");
    expect(cloudSync).toContain("backgroundSyncVersion += 1");
    expect(cloudSync).toMatch(/\.finally\(\(\) => \{[\s\S]*backgroundSyncVersion \+= 1/);
  });

  it("does not touch shared calendar sync keys in this fix path", () => {
    const sync = src("src/lib/cloud/sync-app-data-on-login.ts");
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(sync).not.toContain("sharedCalendarEvents");
    expect(sync).not.toContain("syncSharedGoogleCalendars");
    expect(page).toContain("syncSharedGoogleCalendars");
  });
});
