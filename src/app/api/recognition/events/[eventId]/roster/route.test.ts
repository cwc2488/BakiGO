import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const getRecognitionApprovedRosterMock = vi.fn();

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
  getRecognitionApprovedRoster: getRecognitionApprovedRosterMock,
}));

describe("GET approved roster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects public users", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/roster"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns approved roster for Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    getRecognitionApprovedRosterMock.mockResolvedValueOnce({
      eventId: "evt-1",
      awards: [],
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/roster"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(200);
  });
});
