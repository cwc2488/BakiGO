import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listAwardDefinitionsMock = vi.fn();

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
  listAwardDefinitions: listAwardDefinitionsMock,
}));

describe("GET /api/recognition/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    isSupabaseServiceConfiguredMock.mockReturnValueOnce(true);
    assertRecognitionAdminMock.mockRejectedValueOnce(new Error("Recognition Admin access required."));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/catalog"));
    const body = await response.json();

    expect(assertRecognitionAdminMock).toHaveBeenCalledWith("mem-1");
    expect(response.status).toBe(500);
    expect(body.error).toBe("Recognition Admin access required.");
  });

  it("returns catalog for Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    isSupabaseServiceConfiguredMock.mockReturnValueOnce(true);
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    listAwardDefinitionsMock.mockResolvedValueOnce([
      { id: "1", slug: "map_month_1", name: "MAP 第一個月" },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/catalog"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.awards).toHaveLength(1);
  });
});
