import { describe, expect, it, beforeEach } from "vitest";
import { logTodayActivity } from "@/lib/daily-action/log-today-action";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { ACTIVITY_LIFECYCLE_STATUS } from "@/lib/event-center/activity-lifecycle";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

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

describe("quick activity logging", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.bakiEvents, "[]");
  });

  it("quick measurement keeps legacy create semantics without lifecycle metadata", () => {
    logTodayActivity("measurement", { customerName: "量測對象" }, storage);
    const event = createEventRepository(storage).getAll()[0];
    expect(event?.metadata?.lifecycleStatus).toBeUndefined();
    expect(event?.metadata?.source).toBeUndefined();
    expect(projectEventsForEngines(createEventRepository(storage).getAll()).activities).toHaveLength(1);
  });

  it("quick consultation creates one completed lifecycle event", () => {
    logTodayActivity("consultation", { customerName: "諮詢對象" }, storage);
    const event = createEventRepository(storage).getAll()[0];
    expect(event?.eventTypeKey).toBe(ACTIVITY_EVENT_KEYS.CONSULTATION);
    expect(event?.metadata?.lifecycleStatus).toBe(ACTIVITY_LIFECYCLE_STATUS.COMPLETED);
    expect(event?.metadata?.source).toBe("quick");
  });
});
