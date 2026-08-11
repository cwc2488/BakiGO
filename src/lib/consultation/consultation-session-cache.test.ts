import { describe, expect, it } from "vitest";
import {
  clearConsultationSessionCache,
  consultationSessionCacheCoversStep,
  getConsultationSessionCache,
  setConsultationSessionCache,
} from "./consultation-session-cache";
import type { ConsultationSessionRecord } from "@/types/consultation";

const record: ConsultationSessionRecord = {
  session: {
    id: "s1",
    customerId: "c1",
    ownerMemberId: "m1",
    currentStep: 5,
    status: "in_progress",
    healthSafetyFlag: "pending_review",
    successStoryCount: 0,
    startedAt: "2026-08-11",
    createdAt: "2026-08-11",
    updatedAt: "2026-08-11",
  },
  data: {
    sessionId: "s1",
    dataJson: {},
    createdAt: "2026-08-11",
    updatedAt: "2026-08-11",
  },
};

describe("consultation-session-cache", () => {
  it("stores and retrieves session record by id", () => {
    clearConsultationSessionCache();
    setConsultationSessionCache("s1", record);
    expect(getConsultationSessionCache("s1")).toEqual(record);
    expect(getConsultationSessionCache("other")).toBeNull();
  });

  it("checks whether cache covers requested step", () => {
    expect(consultationSessionCacheCoversStep(record, 5)).toBe(true);
    expect(consultationSessionCacheCoversStep(record, 6)).toBe(false);
  });
});
