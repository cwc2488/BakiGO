import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const overrideMock = vi.fn();
const excludeMock = vi.fn();

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
  adminOverrideRecognitionEntry: overrideMock,
  adminExcludeRecognitionEntry: excludeMock,
}));

describe("POST /api/recognition/events/[eventId]/exceptions/[entryId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
    getMemberIdFromRequestMock.mockResolvedValue("member-normal");
  });

  it("17. normal member cannot Admin Override", async () => {
    const { RecognitionServiceError } = await import("@/lib/recognition/recognition-service");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "override" }),
    }), {
      params: Promise.resolve({ eventId: "evt-1", entryId: "entry-1" }),
    });
    expect(res.status).toBe(403);
    expect(overrideMock).not.toHaveBeenCalled();
  });
});

describe("Exception Center source protection", () => {
  it("18. Exception Center route requires assertRecognitionAdmin", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/recognition/events/[eventId]/exceptions/route.ts"),
      "utf8",
    );
    expect(source).toContain("assertRecognitionAdmin");
    expect(source).toContain("getMemberIdFromRequest");
  });
});
