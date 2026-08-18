import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const updateRecognitionCandidatePhotoReviewMock = vi.fn();

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
  getRecognitionCandidatePhotoReview: vi.fn(),
  updateRecognitionCandidatePhotoReview: updateRecognitionCandidatePhotoReviewMock,
}));

describe("PATCH photo review crop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects non-admin crop mutations", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(new Request("http://localhost/api/recognition/events/evt-1/photo-review/c-1", {
      method: "PATCH",
      body: JSON.stringify({
        sourceEntryId: "entry-1",
        crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.6 },
        finalize: true,
      }),
    }), { params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }) });
    expect(res.status).toBe(403);
    expect(updateRecognitionCandidatePhotoReviewMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated crop mutations", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(new Request("http://localhost/api/recognition/events/evt-1/photo-review/c-1", {
      method: "PATCH",
      body: JSON.stringify({ sourceEntryId: "entry-1" }),
    }), { params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }) });
    expect(res.status).toBe(401);
    expect(updateRecognitionCandidatePhotoReviewMock).not.toHaveBeenCalled();
  });
});
