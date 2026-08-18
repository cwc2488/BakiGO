import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const syncRecognitionEventCandidatesMock = vi.fn();

vi.mock("@/lib/supabase/member-auth", () => ({
  getMemberIdFromRequest: getMemberIdFromRequestMock,
}));

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: isSupabaseServiceConfiguredMock,
}));

vi.mock("@/lib/recognition/recognition-service", () => ({
  RecognitionServiceError: class RecognitionServiceError extends Error {
    constructor(
      message: string,
      readonly status: number = 400,
    ) {
      super(message);
      this.name = "RecognitionServiceError";
    }
  },
  assertRecognitionAdmin: assertRecognitionAdminMock,
}));

vi.mock("@/lib/recognition/recognition-candidate-service", () => ({
  syncRecognitionEventCandidates: syncRecognitionEventCandidatesMock,
}));

describe("POST /api/recognition/events/[eventId]/candidates/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("requires Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/recognition/events/evt-1/candidates/sync", { method: "POST" }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("syncs candidates for Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    syncRecognitionEventCandidatesMock.mockResolvedValueOnce({
      eventId: "evt-1",
      candidateCount: 2,
      sourceLinkCount: 3,
      createdCandidateCount: 2,
      createdSourceLinkCount: 3,
    });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/recognition/events/evt-1/candidates/sync", { method: "POST" }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(200);
    expect(syncRecognitionEventCandidatesMock).toHaveBeenCalledWith("evt-1");
  });
});
