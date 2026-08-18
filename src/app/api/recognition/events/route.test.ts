import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberIdFromRequestMock = vi.fn();
const isSupabaseServiceConfiguredMock = vi.fn();
const assertRecognitionAdminMock = vi.fn();
const listRecognitionEventSummariesMock = vi.fn();
const createRecognitionEventMock = vi.fn();

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
  listRecognitionEventSummaries: listRecognitionEventSummariesMock,
  createRecognitionEvent: createRecognitionEventMock,
}));

describe("/api/recognition/events authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
  });

  it("A. denies unauthenticated reads", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/events"));
    expect(response.status).toBe(401);
    expect(assertRecognitionAdminMock).not.toHaveBeenCalled();
  });

  it("C. denies a normal partner read", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/recognition/events"));
    expect(response.status).toBe(403);
    expect(listRecognitionEventSummariesMock).not.toHaveBeenCalled();
  });

  it("D. denies a normal partner mutation", async () => {
    getMemberIdFromRequestMock.mockResolvedValueOnce("partner-1");
    assertRecognitionAdminMock.mockRejectedValueOnce(
      new RecognitionServiceError("Recognition Admin access required.", 403),
    );
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/recognition/events", {
      method: "POST",
      body: JSON.stringify({ name: "月會", year: 2026, month: 9 }),
    }));
    expect(response.status).toBe(403);
    expect(createRecognitionEventMock).not.toHaveBeenCalled();
  });

  it("G. allows Recognition Admin to list and create events", async () => {
    getMemberIdFromRequestMock.mockResolvedValue("admin-1");
    assertRecognitionAdminMock.mockResolvedValue(undefined);
    listRecognitionEventSummariesMock.mockResolvedValueOnce([]);
    createRecognitionEventMock.mockResolvedValueOnce({ id: "evt-1", name: "月會" });

    const { GET, POST } = await import("./route");
    const list = await GET(new Request("http://localhost/api/recognition/events"));
    expect(list.status).toBe(200);

    const created = await POST(new Request("http://localhost/api/recognition/events", {
      method: "POST",
      body: JSON.stringify({ name: "月會", year: 2026, month: 9 }),
    }));
    expect(created.status).toBe(201);
    expect(createRecognitionEventMock).toHaveBeenCalled();
  });
});
