import { describe, expect, it } from "vitest";
import { buildOptimisticStepRecord } from "./consultation-step-navigation";
import type { ConsultationSessionRecord } from "@/types/consultation";

const baseRecord: ConsultationSessionRecord = {
  session: {
    id: "session-1",
    customerId: "customer-1",
    ownerMemberId: "member-1",
    currentStep: 4,
    status: "in_progress",
    healthSafetyFlag: "pending_review",
    successStoryCount: 0,
    startedAt: "2026-08-11T00:00:00.000Z",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
  data: {
    sessionId: "session-1",
    dataJson: {},
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
};

describe("consultation-step-navigation", () => {
  it("builds optimistic record with next step and merged data_json", () => {
    const next = buildOptimisticStepRecord(baseRecord, 4, {
      goals: { goalType: "fat_loss", goalNotes: "test" },
    });
    expect(next.session.currentStep).toBe(5);
    expect(next.data.dataJson.goals).toEqual({ goalType: "fat_loss", goalNotes: "test" });
  });
});
