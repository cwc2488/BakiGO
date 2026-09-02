import { describe, expect, it } from "vitest";
import { ACTIVITY_LIFECYCLE_STATUS } from "@/lib/event-center/activity-lifecycle";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { logTodayActivity } from "@/lib/daily-action/log-today-action";
import { completeCalendarActivityEvent } from "@/lib/calendar/calendar-baki-event-sync";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";

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

function seedAuth(storage: MemoryStorage, memberId: string): void {
  storage.setItem(
    STORAGE_KEYS.authSession,
    JSON.stringify({ memberId, token: "test", expiresAt: Date.now() + 60_000 }),
  );
}

describe("consultation completion semantics", () => {
  it("quick consultation creates one completed event counted once for KPI", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.bakiEvents, "[]");
    seedAuth(storage, "member-1");

    logTodayActivity(
      "consultation",
      { customerName: "快速諮詢對象", region: "台中" },
      storage,
    );

    const events = createEventRepository(storage).getAll();
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.COMPLETED);
    expect(events[0]?.metadata?.source).toBe("quick");

    const projected = projectEventsForEngines(events);
    expect(projected.activities.filter((a) => a.activityKey === ACTIVITY_EVENT_KEYS.CONSULTATION)).toHaveLength(1);
  });

  it("scheduled and quick completed consultations share KPI eligibility rules", () => {
    const scheduledCompleted: BakiEvent = {
      id: "scheduled-complete",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      organizationId: "org-default",
      memberId: "member-1",
      eventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
      eventCategory: "activity",
      eventDate: "2026-09-01",
      metadata: {
        lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.COMPLETED,
        source: "calendar",
      },
    };
    const quickCompleted: BakiEvent = {
      ...scheduledCompleted,
      id: "quick-complete",
      metadata: {
        lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.COMPLETED,
        source: "quick",
      },
    };
    const scheduledPending: BakiEvent = {
      ...scheduledCompleted,
      id: "scheduled-pending",
      metadata: {
        lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.SCHEDULED,
        source: "calendar",
      },
    };

    const projected = projectEventsForEngines([
      scheduledCompleted,
      quickCompleted,
      scheduledPending,
    ]);

    expect(projected.activities).toHaveLength(2);
  });
});

describe("storage quota UX", () => {
  it("maps QuotaExceededError to safe Traditional Chinese message", async () => {
    const { toStorageUserError } = await import("@/lib/repositories/storage-quota-error");
    const error = new DOMException("quota", "QuotaExceededError");
    expect(toStorageUserError(error).message).toContain("本機儲存空間不足");
    expect(toStorageUserError(error).message).not.toContain("QuotaExceededError");
  });
});
