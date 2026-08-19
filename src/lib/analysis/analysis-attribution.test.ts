import { describe, expect, it } from "vitest";
import {
  ANALYSIS_SESSION_TTL_DAYS,
  resolveAnalysisAttribution,
} from "@/lib/analysis/analysis-attribution";

describe("analysis attribution precedence", () => {
  it("P1-11 / P1-12 — referral /r wins over quiz /q member share", () => {
    const resolved = resolveAnalysisAttribution({
      growthShareId: "11111111-1111-4111-8111-111111111111",
      quizShareCode: "ABC123",
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
    });
    expect(resolved.sourceType).toBe("referral_share");
    expect(resolved.growthShareId).toBe("11111111-1111-4111-8111-111111111111");
    // Member fields retained for audit but do not own A→B authority.
    expect(resolved.quizShareCode).toBe("ABC123");
    expect(resolved.referrerMemberId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("P1-13 — direct quiz source works", () => {
    expect(
      resolveAnalysisAttribution({
        growthShareId: null,
        quizShareCode: null,
        referrerMemberId: null,
      }).sourceType,
    ).toBe("direct");
  });

  it("quiz member share alone becomes quiz_member_share", () => {
    expect(
      resolveAnalysisAttribution({
        growthShareId: null,
        quizShareCode: "XYZ999",
        referrerMemberId: null,
      }).sourceType,
    ).toBe("quiz_member_share");
  });

  it("QUIZ-VIRAL-01 — /s result share loses to /r and /q, wins over direct", () => {
    const shareId = "44444444-4444-4444-8444-444444444444";
    const referralWins = resolveAnalysisAttribution({
      growthShareId: "11111111-1111-4111-8111-111111111111",
      quizShareCode: "ABC123",
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      resultShareId: shareId,
    });
    expect(referralWins.sourceType).toBe("referral_share");
    expect(referralWins.resultShareId).toBe(shareId);

    const partnerWins = resolveAnalysisAttribution({
      growthShareId: null,
      quizShareCode: "ABC123",
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      resultShareId: shareId,
    });
    expect(partnerWins.sourceType).toBe("quiz_member_share");
    expect(partnerWins.resultShareId).toBe(shareId);

    const resultShare = resolveAnalysisAttribution({
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      resultShareId: shareId,
    });
    expect(resultShare.sourceType).toBe("result_share");
    expect(resultShare.resultShareId).toBe(shareId);
    expect(resultShare.referrerMemberId).toBeNull();
  });

  it("P1-14 — Radar candidate is nullable and never required", () => {
    const withRadar = resolveAnalysisAttribution({
      growthShareId: null,
      quizShareCode: null,
      referrerMemberId: null,
      radarCandidateId: "33333333-3333-4333-8333-333333333333",
    });
    expect(withRadar.sourceType).toBe("radar_candidate");
    expect(withRadar.radarCandidateId).toBeTruthy();

    const referralBeatsRadar = resolveAnalysisAttribution({
      growthShareId: "11111111-1111-4111-8111-111111111111",
      quizShareCode: null,
      referrerMemberId: null,
      radarCandidateId: "33333333-3333-4333-8333-333333333333",
    });
    expect(referralBeatsRadar.sourceType).toBe("referral_share");
    expect(referralBeatsRadar.radarCandidateId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("P1-10 — TTL is 30 days", () => {
    expect(ANALYSIS_SESSION_TTL_DAYS).toBe(30);
  });
});
