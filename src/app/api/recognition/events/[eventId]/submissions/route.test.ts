import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listRecognitionRawSubmissionsMock = vi.fn();

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
  listRecognitionRawSubmissions: listRecognitionRawSubmissionsMock,
}));

describe("GET /api/recognition/events/[eventId]/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("requires Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(new Error("Recognition Admin access required."));

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/submissions"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns raw submission visibility for admins", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    listRecognitionRawSubmissionsMock.mockResolvedValueOnce([
      {
        submission: {
          id: "sub-1",
          eventId: "evt-1",
          submitterName: "王老師",
          submitterOrganization: "A組",
          submittedAt: "2026-09-01T00:00:00Z",
          createdAt: "2026-09-01T00:00:00Z",
        },
        entries: [
          {
            id: "entry-1",
            submissionId: "sub-1",
            eventId: "evt-1",
            eventAwardId: "ea-1",
            submittedName: "王小明",
            normalizedName: "王小明",
            originalPhotoStoragePath: null,
            originalPhotoMimeType: null,
            originalPhotoSizeBytes: null,
            createdAt: "2026-09-01T00:00:00Z",
            awardName: "MAP 第一個月",
            requiresPhoto: false,
            hasOriginalPhoto: false,
          },
        ],
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/submissions"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalSubmissions).toBe(1);
    expect(body.totalEntries).toBe(1);
  });
});
