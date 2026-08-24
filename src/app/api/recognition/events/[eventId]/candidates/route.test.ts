import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listRecognitionCandidatesMock = vi.fn();
const syncRecognitionEventCandidatesMock = vi.fn();
const updateRecognitionCandidateMock = vi.fn();
const getRecognitionCandidatePhotoObjectMock = vi.fn();
const getRecognitionApprovedRosterMock = vi.fn();

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
  listRecognitionCandidates: listRecognitionCandidatesMock,
  syncRecognitionEventCandidates: syncRecognitionEventCandidatesMock,
  updateRecognitionCandidate: updateRecognitionCandidateMock,
  getRecognitionCandidatePhotoObject: getRecognitionCandidatePhotoObjectMock,
  getRecognitionApprovedRoster: getRecognitionApprovedRosterMock,
}));

describe("Recognition candidate and review APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects unauthenticated public access to candidate list", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin review access", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new (await import("@/lib/recognition/recognition-service")).RecognitionServiceError(
        "Recognition Admin access required.",
        403,
      ),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("lets Recognition Admin list candidates", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    listRecognitionCandidatesMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(200);
  });
});
