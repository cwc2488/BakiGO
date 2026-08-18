import { describe, expect, it } from "vitest";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import type { BakiEvent } from "@/types/baki-event";

describe("projectEventsForEngines", () => {
  it("skips null/invalid cloud payload rows instead of crashing", () => {
    const valid: BakiEvent = {
      id: "evt-1",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
      organizationId: "org-default",
      memberId: "member-1",
      eventTypeKey: "measurement",
      eventCategory: "activity",
      eventDate: "2026-08-18",
    };

    const projected = projectEventsForEngines([
      null as unknown as BakiEvent,
      valid,
      undefined as unknown as BakiEvent,
      { ...valid, id: "evt-no-date", eventDate: undefined as unknown as string },
    ]);

    expect(projected.activities).toHaveLength(1);
    expect(projected.activities[0]?.id).toBe("evt-1");
  });
});
