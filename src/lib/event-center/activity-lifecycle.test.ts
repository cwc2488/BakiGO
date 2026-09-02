import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LIFECYCLE_STATUS,
  isActivityCountedForKpi,
} from "@/lib/event-center/activity-lifecycle";
import type { BakiEvent } from "@/types/baki-event";

function baseEvent(overrides: Partial<BakiEvent> = {}): BakiEvent {
  return {
    id: "evt-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    organizationId: "org-default",
    memberId: "member-1",
    eventTypeKey: "consultation",
    eventCategory: "activity",
    eventDate: "2026-09-01",
    ...overrides,
  };
}

describe("activity lifecycle", () => {
  it("counts legacy events without lifecycle status for KPI", () => {
    expect(isActivityCountedForKpi(baseEvent())).toBe(true);
  });

  it("excludes scheduled and skipped events from KPI", () => {
    expect(
      isActivityCountedForKpi(
        baseEvent({
          metadata: { lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.SCHEDULED },
        }),
      ),
    ).toBe(false);
    expect(
      isActivityCountedForKpi(
        baseEvent({
          metadata: { lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.SKIPPED },
        }),
      ),
    ).toBe(false);
  });

  it("includes completed lifecycle events for KPI", () => {
    expect(
      isActivityCountedForKpi(
        baseEvent({
          metadata: { lifecycleStatus: ACTIVITY_LIFECYCLE_STATUS.COMPLETED },
        }),
      ),
    ).toBe(true);
  });
});
