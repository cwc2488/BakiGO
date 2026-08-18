import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const getRecognitionCandidatePhotoObjectMock = vi.fn();

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
  getRecognitionCandidatePhotoObject: getRecognitionCandidatePhotoObjectMock,
}));

describe("GET candidate photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("requires Recognition Admin for private photo access", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(new RecognitionServiceError("Recognition Admin access required.", 403));
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates/c-1/photo?sourceEntryId=e-1"), {
      params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects public users", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates/c-1/photo?sourceEntryId=e-1"), {
      params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns a private no-store image response, not a permanent public URL", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    getRecognitionCandidatePhotoObjectMock.mockResolvedValueOnce({
      path: "recognition/sub-1/entries/e-1/original.jpg",
      mimeType: "image/jpeg",
      body: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/candidates/c-1/photo?sourceEntryId=e-1"), {
      params: Promise.resolve({ eventId: "evt-1", candidateId: "c-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Location")).toBeNull();
  });
});
