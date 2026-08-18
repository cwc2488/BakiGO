import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const updateRecognitionCandidateMock = vi.fn();

class RecognitionServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "RecognitionServiceError";
  }
}

vi.mock("@/lib/supabase/member-auth", () => ({
  getMemberIdFromRequest: getMemberIdFromRequestMock,
}));

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: isSupabaseServiceConfiguredMock,
}));

vi.mock("@/lib/recognition/recognition-service", () => ({
  RecognitionServiceError,
  assertRecognitionAdmin: assertRecognitionAdminMock,
}));

vi.mock("@/lib/recognition/recognition-candidate-service", () => ({
  getRecognitionCandidate: vi.fn(),
  updateRecognitionCandidate: updateRecognitionCandidateMock,
}));

describe("PATCH /api/recognition/events/[eventId]/candidates/[candidateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects non-admin review mutations", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(new RecognitionServiceError("Recognition Admin access required.", 403));
    const { PATCH } = await import("./route");
    const res = await PATCH(new Request("http://localhost/api/recognition/events/evt-1/candidates/c-1", {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "approved" }),
    }), { params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }) });
    expect(res.status).toBe(403);
    expect(updateRecognitionCandidateMock).not.toHaveBeenCalled();
  });

  it("lets admin approve, needs_fix, reject, and return to pending", async () => {
    getMemberIdFromRequestMock.mockResolvedValue("mem-1");
    assertRecognitionAdminMock.mockResolvedValue(undefined);
    updateRecognitionCandidateMock.mockImplementation(async (_eventId: string, _id: string, input: { reviewStatus: string }) => ({
      id: "c-1",
      reviewStatus: input.reviewStatus,
    }));
    const { PATCH } = await import("./route");
    for (const reviewStatus of ["approved", "needs_fix", "rejected", "pending"] as const) {
      const res = await PATCH(new Request("http://localhost/api/recognition/events/evt-1/candidates/c-1", {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus }),
      }), { params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }) });
      expect(res.status).toBe(200);
      expect(updateRecognitionCandidateMock).toHaveBeenCalledWith("evt-1", "c-1", { reviewStatus }, "mem-1");
    }
  });
});
