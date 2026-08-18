import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listRecognitionPhotoReviewQueueMock = vi.fn();
const getRecognitionCandidatePhotoReviewMock = vi.fn();
const updateRecognitionCandidatePhotoReviewMock = vi.fn();
const getRecognitionEventPptReadinessMock = vi.fn();

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

vi.mock("@/lib/recognition/recognition-photo-review-service", () => ({
  listRecognitionPhotoReviewQueue: listRecognitionPhotoReviewQueueMock,
  getRecognitionCandidatePhotoReview: getRecognitionCandidatePhotoReviewMock,
  updateRecognitionCandidatePhotoReview: updateRecognitionCandidatePhotoReviewMock,
  getRecognitionEventPptReadiness: getRecognitionEventPptReadinessMock,
}));

describe("Recognition photo review APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects public users from photo review list", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/photo-review"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
    expect(listRecognitionPhotoReviewQueueMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin photo review reads", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/photo-review"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(403);
    expect(listRecognitionPhotoReviewQueueMock).not.toHaveBeenCalled();
  });
});
