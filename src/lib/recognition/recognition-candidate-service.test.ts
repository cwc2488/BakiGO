import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase/service-client", () => ({
  createSupabaseServiceClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
    storage: { from: () => ({ download: vi.fn() }) },
  }),
}));

const getRecognitionEventMock = vi.fn();
const listEventAwardsMock = vi.fn();

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
  getRecognitionEvent: (...args: unknown[]) => getRecognitionEventMock(...args),
  listEventAwards: (...args: unknown[]) => listEventAwardsMock(...args),
}));

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  const self = () => query;
  query.select = vi.fn(self);
  query.eq = vi.fn(self);
  query.in = vi.fn(self);
  query.order = vi.fn(self);
  query.single = vi.fn(async () => ({ data: result, error: null }));
  query.then = (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: result, error: null });
  return query;
}

describe("Recognition candidate service", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    getRecognitionEventMock.mockReset();
    listEventAwardsMock.mockReset();
    updateCalls.length = 0;
    getRecognitionEventMock.mockResolvedValue({
      id: "evt-1",
      name: "月會",
      year: 2026,
      month: 9,
    });
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "MAP 第一個月", sortOrder: 1, isEnabled: true, requiresPhoto: false },
    ]);
  });

  it("syncs candidates through the consolidation RPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        eventId: "evt-1",
        candidateCount: 50,
        sourceLinkCount: 50,
        createdCandidateCount: 0,
        createdSourceLinkCount: 0,
      },
      error: null,
    });
    const { syncRecognitionEventCandidates } = await import("./recognition-candidate-service");
    const result = await syncRecognitionEventCandidates("evt-1");
    expect(mockRpc).toHaveBeenCalledWith("consolidate_recognition_event_candidates", {
      p_event_id: "evt-1",
    });
    expect(result.candidateCount).toBe(50);
  });

  it("does not touch raw evidence fields when reviewing a candidate", async () => {
    const candidateRow = {
      id: "cand-1",
      event_id: "evt-1",
      event_award_id: "award-1",
      display_name: "王小明老師",
      normalized_name: "王小明老師",
      review_status: "pending",
      member_id: null,
      preferred_source_entry_id: null,
      sort_order: 1,
      reviewed_at: null,
      reviewed_by_member_id: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "recognition_candidates") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [candidateRow], error: null }),
              select: () => ({
                single: async () => ({ data: { id: "cand-1" }, error: null }),
              }),
              single: async () => ({ data: { id: "cand-1" }, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updateCalls.push({ table, patch });
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => ({ data: { id: "cand-1" }, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "recognition_candidate_sources") {
        return chain([]);
      }
      if (table === "recognition_submission_entries") {
        return chain([]);
      }
      if (table === "recognition_submissions") {
        return chain([]);
      }
      return chain([]);
    });

    const { updateRecognitionCandidate, recognitionCandidatePatchTouchesRawEvidence } = await import("./recognition-candidate-service");
    await updateRecognitionCandidate("evt-1", "cand-1", { reviewStatus: "approved" }, "admin-1");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.table).toBe("recognition_candidates");
    expect(recognitionCandidatePatchTouchesRawEvidence(Object.keys(updateCalls[0]?.patch ?? {}))).toBe(false);
    expect(updateCalls[0]?.patch.review_status).toBe("approved");
    expect(updateCalls[0]?.patch).not.toHaveProperty("submitted_name");
    expect(updateCalls[0]?.patch).not.toHaveProperty("normalized_name");
  });
});
