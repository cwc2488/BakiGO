import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const getRecognitionEventMock = vi.fn();
const updateRecognitionEventMock = vi.fn();
const deleteRecognitionEventMock = vi.fn();

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
  getRecognitionEvent: getRecognitionEventMock,
  updateRecognitionEvent: updateRecognitionEventMock,
  deleteRecognitionEvent: deleteRecognitionEventMock,
}));

describe("DELETE /api/recognition/events/[eventId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("denies unauthenticated deletes", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/recognition/events/evt-1"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(response.status).toBe(401);
    expect(deleteRecognitionEventMock).not.toHaveBeenCalled();
  });

  it("denies a normal partner", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/recognition/events/evt-1"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(response.status).toBe(403);
    expect(deleteRecognitionEventMock).not.toHaveBeenCalled();
  });

  it("allows Super Admin and deletes the event", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("admin-1");
    assertRecognitionAdminMock.mockResolvedValueOnce(undefined);
    deleteRecognitionEventMock.mockResolvedValueOnce({ eventId: "evt-1" });
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/recognition/events/evt-1"), {
      params: Promise.resolve({ eventId: "evt-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, eventId: "evt-1" });
    expect(deleteRecognitionEventMock).toHaveBeenCalledWith("evt-1");
  });
});
