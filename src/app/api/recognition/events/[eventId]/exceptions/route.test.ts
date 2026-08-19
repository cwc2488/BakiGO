import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listMock = vi.fn();

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

vi.mock("@/lib/recognition/recognition-validation-service", () => ({
  listRecognitionExceptions: listMock,
}));

describe("GET /api/recognition/events/[eventId]/exceptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
    getMemberIdFromRequestMock.mockResolvedValue("member-normal");
  });

  it("18. normal member cannot access Exception Center", async () => {
    const { RecognitionServiceError } = await import("@/lib/recognition/recognition-service");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
});
