import { beforeEach, describe, expect, it, vi } from "vitest";

const isSupabaseServiceConfiguredMock = vi.fn();
const resolveRecognitionPublicEventByTokenMock = vi.fn();
const allowRecognitionPublicLookupMock = vi.fn();
const getRecognitionClientIpMock = vi.fn();

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
  resolveRecognitionPublicEventByToken: resolveRecognitionPublicEventByTokenMock,
}));

vi.mock("@/lib/recognition/recognition-public-rate-limit", () => ({
  allowRecognitionPublicLookup: allowRecognitionPublicLookupMock,
  getRecognitionClientIp: getRecognitionClientIpMock,
}));

describe("GET /api/recognition/public/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceConfiguredMock.mockReturnValue(true);
    allowRecognitionPublicLookupMock.mockReturnValue(true);
    getRecognitionClientIpMock.mockReturnValue("127.0.0.1");
  });

  it("rejects invalid token", async () => {
    resolveRecognitionPublicEventByTokenMock.mockResolvedValueOnce({ state: "invalid", event: null });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/public/bad"), {
      params: Promise.resolve({ token: "bad" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns only public-safe event data", async () => {
    resolveRecognitionPublicEventByTokenMock.mockResolvedValueOnce({
      state: "open",
      event: {
        eventId: "evt-1",
        name: "2026 年 9 月月會",
        year: 2026,
        month: 9,
        collectEndsAt: "2026-09-30T00:00:00Z",
        awards: [
          {
            eventAwardId: "ea-1",
            awardDefinitionId: "def-1",
            slug: "map_month_1",
            name: "MAP 第一個月",
            requiresPhoto: false,
            sortOrder: 1,
          },
        ],
      },
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/recognition/public/good"), {
      params: Promise.resolve({ token: "good" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.event.name).toBe("2026 年 9 月月會");
    expect(body.event.publicCollectionToken).toBeUndefined();
    expect(body.event.createdByMemberId).toBeUndefined();
  });
});
