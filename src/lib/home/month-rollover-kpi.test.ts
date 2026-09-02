import { describe, expect, it } from "vitest";
import {
  APP_IDS,
  APP_TIMEZONE,
  currentAppHour,
  millisecondsUntilNextAppMidnight,
  todayISODate,
  toYearMonthFromDate,
} from "@/lib/config/app-config";
import { readMissionControlMetrics } from "@/lib/mission-control/format";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import { logTodayActivity } from "@/lib/daily-action/log-today-action";
import { buildDailyActionSnapshot } from "@/lib/daily-action/daily-action-selectors";
import { syncPersonalCalendarEventToBakiEvent } from "@/lib/calendar/calendar-baki-event-sync";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CalendarEvent } from "@/types/calendar-event";

const MEMBER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function seedAuth(storage: StorageAdapter) {
  storage.setItem(
    STORAGE_KEYS.authSession,
    JSON.stringify({
      memberId: MEMBER_ID,
      memberNumber: "B001",
      herbalifeMemberId: "B001",
      email: "b@example.com",
      signedInAt: "2026-08-01T00:00:00.000Z",
    }),
  );
  storage.setItem(
    STORAGE_KEYS.members,
    JSON.stringify([
      {
        id: MEMBER_ID,
        organizationId: APP_IDS.organizationId,
        displayName: "測試夥伴",
        herbalifeMemberId: "B001",
        email: "b@example.com",
        rankKey: "supervisor",
        roleKey: "member",
        status: "active",
        joinedAt: "2026-01-01",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
  storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
  storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify([]));
}

describe("REQUIRED — Asia/Taipei day & month rollover", () => {
  it("uses Asia/Taipei as the app timezone constant", () => {
    expect(APP_TIMEZONE).toBe("Asia/Taipei");
  });

  it("2026-08-31 23:59 Taipei stays August 31", () => {
    const justBefore = new Date("2026-08-31T15:59:00.000Z");
    expect(todayISODate(justBefore)).toBe("2026-08-31");
    expect(toYearMonthFromDate(todayISODate(justBefore))).toBe("2026-08");
  });

  it("2026-09-01 00:00 Taipei becomes September 1 (UTC still Aug 31)", () => {
    const taipeiMidnight = new Date("2026-08-31T16:00:00.000Z");
    expect(todayISODate(taipeiMidnight)).toBe("2026-09-01");
    expect(toYearMonthFromDate(todayISODate(taipeiMidnight))).toBe("2026-09");
    expect(taipeiMidnight.getUTCDate()).toBe(31);
    expect(taipeiMidnight.getUTCMonth()).toBe(7);
  });

  it("millisecondsUntilNextAppMidnight crosses the Taipei boundary", () => {
    const justBefore = new Date("2026-08-31T15:59:30.000Z");
    const delay = millisecondsUntilNextAppMidnight(justBefore);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60_000);
    const crossed = new Date(justBefore.getTime() + delay + 10);
    expect(todayISODate(crossed)).toBe("2026-09-01");
  });

  it("currentAppHour follows Taipei, not UTC", () => {
    const morningTaipei = new Date("2026-08-31T17:30:00.000Z");
    expect(currentAppHour(morningTaipei)).toBe(1);
  });

  it("stale cached metrics from a prior day are rejected", () => {
    const storage = memoryStorage();
    seedAuth(storage);
    const august = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: "2026-08-31", includeMapUniverse: false },
      storage,
    );
    expect(august.missions.referenceDate).toBe("2026-08-31");
    expect(august.yearMonth).toBe("2026-08");

    const today = todayISODate();
    const cached = readMissionControlMetrics(MEMBER_ID, storage);
    if (today === "2026-08-31") {
      expect(cached?.missions.referenceDate).toBe("2026-08-31");
    } else {
      expect(cached).toBeNull();
    }
  });
});

describe("REQUIRED — monthly KPI source-of-truth (量測 / 諮詢)", () => {
  it("September excludes August activity and counts canonical writes", () => {
    const storage = memoryStorage();
    seedAuth(storage);

    processEventForCurrentMember(
      {
        eventTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
        eventCategory: "activity",
        eventDate: "2026-08-20",
        metadata: { customerName: "八月客戶" },
      },
      storage,
    );

    processEventForCurrentMember(
      {
        eventTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
        eventCategory: "activity",
        eventDate: "2026-09-01",
        metadata: { customerName: "九月量測", source: "quick_record" },
      },
      storage,
    );

    processEventForCurrentMember(
      {
        eventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
        eventCategory: "activity",
        eventDate: "2026-09-01",
        metadata: { customerName: "九月諮詢", source: "calendar" },
      },
      storage,
    );

    const september = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: "2026-09-01", includeMapUniverse: false },
      storage,
    );
    const septemberDaily = buildDailyActionSnapshot(september, storage);
    expect(septemberDaily.monthlyMeasurement.current).toBe(1);
    expect(septemberDaily.monthlyConsultation.current).toBe(1);

    const august = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: "2026-08-31", includeMapUniverse: false },
      storage,
    );
    const augustDaily = buildDailyActionSnapshot(august, storage);
    expect(augustDaily.monthlyMeasurement.current).toBe(1);
    expect(augustDaily.monthlyConsultation.current).toBe(0);
  });

  it("calendar completion with result writes measurement into the same store", () => {
    const storage = memoryStorage();
    seedAuth(storage);

    const calendarEvent = {
      id: "cal-m1",
      memberId: MEMBER_ID,
      title: "體脂量測",
      notes: "",
      startAt: "2026-09-01T10:00",
      endAt: "2026-09-01T11:00",
      allDay: false,
      activityTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
      color: "green" as const,
      recurrence: { frequency: "none" as const, interval: 1 },
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    } satisfies CalendarEvent;

    syncPersonalCalendarEventToBakiEvent(storage, MEMBER_ID, calendarEvent, "2026-09-01", {
      customerName: "完成活動客戶",
      note: "實際完成",
    });

    const metrics = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: "2026-09-01", includeMapUniverse: false },
      storage,
    );
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(daily.monthlyMeasurement.current).toBe(1);
  });

  it("quick record uses the same activity writer as Home KPI", () => {
    const storage = memoryStorage();
    seedAuth(storage);

    // Pin "today" path: logTodayActivity uses todayISODate().
    // Also write an explicit September twin when runner day differs.
    logTodayActivity("consultation", { customerName: "快速諮詢" }, storage);

    const today = todayISODate();
    const metrics = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: today, includeMapUniverse: false },
      storage,
    );
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(daily.monthlyConsultation.current).toBeGreaterThanOrEqual(1);
  });

  it("skipping without writing an event leaves September KPIs at zero", () => {
    const storage = memoryStorage();
    seedAuth(storage);
    const metrics = recalculateMemberMetrics(
      { memberId: MEMBER_ID, referenceDate: "2026-09-01", includeMapUniverse: false },
      storage,
    );
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(daily.monthlyMeasurement.current).toBe(0);
    expect(daily.monthlyConsultation.current).toBe(0);
  });
});
