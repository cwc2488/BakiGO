import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const getSummaryMock = vi.fn();
const generateMock = vi.fn();

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

vi.mock("@/lib/recognition/recognition-presentation-service", () => ({
  getRecognitionPresentationSummary: (...args: unknown[]) => getSummaryMock(...args),
  generateRecognitionPresentationPptx: (...args: unknown[]) => generateMock(...args),
}));

describe("Recognition presentation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("rejects public users from GET summary", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/events/evt-1/presentation"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
    expect(getSummaryMock).not.toHaveBeenCalled();
  });

  it("rejects public users from POST generate", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/recognition/events/evt-1/presentation", { method: "POST" }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin generation", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("mem-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/recognition/events/evt-1/presentation", { method: "POST" }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(403);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("returns a private PPTX download for Recognition Admin", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("admin-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    generateMock.mockResolvedValueOnce({
      buffer: Buffer.from("PK\u0003\u0004pptx"),
      filename: "2026-09-月會-表揚名單.pptx",
      slideCount: 2,
      approvedCandidateCount: 3,
    });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/recognition/events/evt-1/presentation", { method: "POST" }), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("presentationml.presentation");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Disposition")).toContain("filename*=");
    expect(res.headers.get("Location")).toBeNull();
  });
});

describe("Recognition presentation API source contract", () => {
  it("keeps generation on the admin-authenticated server path", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/recognition/events/[eventId]/presentation/route.ts"),
      "utf8",
    );
    expect(source).toContain("getMemberIdFromRequest");
    expect(source).toContain("assertRecognitionAdmin");
    expect(source).toContain("generateRecognitionPresentationPptx");
    expect(source).toContain("private, no-store");
    expect(source).not.toContain("getPublicUrl");
    expect(source).not.toContain("createSignedUrl");
  });
});
