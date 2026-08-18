import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const isRecognitionAdminMock = vi.fn();

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
  isRecognitionAdmin: isRecognitionAdminMock,
}));

describe("GET /api/recognition/admin/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("A. denies unauthenticated callers", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/admin/me"));
    expect(response.status).toBe(401);
    expect(isRecognitionAdminMock).not.toHaveBeenCalled();
  });

  it("B. denies a normal authenticated partner", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    isRecognitionAdminMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/admin/me"));
    expect(response.status).toBe(403);
    expect(isRecognitionAdminMock).toHaveBeenCalledWith("partner-1");
  });

  it("F. allows a Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("admin-1");
    isRecognitionAdminMock.mockResolvedValueOnce(true);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/admin/me"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("does not trust a client-provided role header", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    isRecognitionAdminMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/admin/me", {
      headers: { "x-recognition-admin": "true", role: "president" },
    }));
    expect(response.status).toBe(403);
    expect(isRecognitionAdminMock).toHaveBeenCalledWith("partner-1");
  });
});
