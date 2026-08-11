import { describe, expect, it } from "vitest";
import { buildConsultationBriefSnapshot, shouldEmitConsultationActivity } from "./consultation-brief";
import type { ConsultationSessionRecord } from "@/types/consultation";

const baseRecord: ConsultationSessionRecord = {
  session: {
    id: "session-1",
    customerId: "customer-1",
    ownerMemberId: "member-1",
    currentStep: 14,
    status: "completed",
    healthSafetyFlag: "pending_review",
    successStoryCount: 3,
    startedAt: "2026-08-11T00:00:00.000Z",
    commitmentScore: 9,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
  data: {
    sessionId: "session-1",
    dataJson: {
      goals: { goalType: "fat_loss", desiredBodyDescription: "腹部平坦" },
      motivations: { reason1: "想更有精神" },
      outcome: { outcome: "started" },
    },
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
};

describe("consultation-brief", () => {
  it("builds deterministic brief snapshot", () => {
    const brief = buildConsultationBriefSnapshot({
      session: baseRecord.session,
      dataJson: baseRecord.data.dataJson,
      customer: {
        displayName: "測試客戶",
        sex: "female",
        birthDate: "1990-01-01",
        region: "台北",
        occupation: "設計師",
        heightCm: 165,
      },
      bodyRecord: {
        recordDate: "2026-08-11",
        weightKg: 60,
        bodyFatPercent: 28,
        skeletalMuscleKg: null,
        bodyFatKg: null,
        bmi: null,
        visceralFatLevel: null,
        basalMetabolicRate: null,
        bodyAge: null,
        age: 36,
      },
      generatedAt: "2026-08-11T12:00:00.000Z",
    });

    expect(brief.customerProfile.displayName).toBe("測試客戶");
    expect(brief.customerProfile.sex).toBe("female");
    expect(brief.goal?.goalType).toBe("fat_loss");
    expect(brief.successStoryCount).toBe(3);
    expect(brief.outcome?.outcome).toBe("started");
    expect(brief.healthSafetyFlag).toBe("pending_review");
  });

  it("emits consultation activity only for started outcome", () => {
    expect(shouldEmitConsultationActivity({ outcome: "started" })).toBe(true);
    expect(shouldEmitConsultationActivity({ outcome: "considering" })).toBe(false);
    expect(shouldEmitConsultationActivity(undefined)).toBe(false);
  });
});
