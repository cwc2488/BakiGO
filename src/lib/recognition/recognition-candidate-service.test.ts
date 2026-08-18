import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR } from "@/lib/recognition/recognition-candidates";

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

function baseCandidate(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function mockTables(input: {
  candidate: ReturnType<typeof baseCandidate>;
  sources?: Array<{ id: string; candidate_id: string; submission_entry_id: string; created_at: string }>;
  entries?: Array<{
    id: string;
    submission_id: string;
    event_id: string;
    event_award_id: string;
    submitted_name: string;
    normalized_name: string;
    original_photo_storage_path: string | null;
    original_photo_mime_type: string | null;
    original_photo_size_bytes: number | null;
    created_at: string;
  }>;
  submissions?: Array<{
    id: string;
    submitter_name: string;
    submitter_organization: string;
    submitted_at: string;
  }>;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "recognition_candidates") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [input.candidate], error: null }),
            select: () => ({
              single: async () => ({ data: { id: input.candidate.id }, error: null }),
            }),
            single: async () => ({ data: { id: input.candidate.id }, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updateCalls.push({ table, patch });
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: input.candidate.id }, error: null }),
                }),
              }),
            }),
          };
        },
      };
    }
    if (table === "recognition_candidate_sources") return chain(input.sources ?? []);
    if (table === "recognition_submission_entries") return chain(input.entries ?? []);
    if (table === "recognition_submissions") return chain(input.submissions ?? []);
    if (table === "recognition_candidate_photo_reviews") return chain([]);
    return chain([]);
  });
}

describe("Recognition candidate service", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    getRecognitionEventMock.mockReset();
    listEventAwardsMock.mockReset();
    updateCalls.length = 0;
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
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

  it("syncs candidates through the consolidation RPC without selecting a preferred photo", async () => {
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
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not touch raw evidence fields when reviewing a name-only candidate", async () => {
    mockTables({ candidate: baseCandidate() });
    const { updateRecognitionCandidate, recognitionCandidatePatchTouchesRawEvidence } = await import("./recognition-candidate-service");
    await updateRecognitionCandidate("evt-1", "cand-1", { reviewStatus: "approved" }, "admin-1");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.table).toBe("recognition_candidates");
    expect(recognitionCandidatePatchTouchesRawEvidence(Object.keys(updateCalls[0]?.patch ?? {}))).toBe(false);
    expect(updateCalls[0]?.patch.review_status).toBe("approved");
    expect(updateCalls[0]?.patch).not.toHaveProperty("submitted_name");
    expect(updateCalls[0]?.patch).not.toHaveProperty("normalized_name");
    expect(updateCalls[0]?.patch).not.toHaveProperty("original_photo_storage_path");
  });

  it("rejects photo-required approval when no original photo exists", async () => {
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
    mockTables({ candidate: baseCandidate() });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await expect(
      updateRecognitionCandidate("evt-1", "cand-1", { reviewStatus: "approved" }, "admin-1"),
    ).rejects.toMatchObject({
      message: RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR,
      status: 400,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects photo-required approval when a photo exists but no preferred source is selected", async () => {
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
    mockTables({
      candidate: baseCandidate(),
      sources: [{ id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" }],
      entries: [{
        id: "entry-1",
        submission_id: "sub-1",
        event_id: "evt-1",
        event_award_id: "award-1",
        submitted_name: "王小明老師",
        normalized_name: "王小明老師",
        original_photo_storage_path: "recognition/sub-1/entries/entry-1/original.jpg",
        original_photo_mime_type: "image/jpeg",
        original_photo_size_bytes: 1000,
        created_at: "2026-09-01T00:00:00Z",
      }],
      submissions: [{
        id: "sub-1",
        submitter_name: "填報者",
        submitter_organization: "A組",
        submitted_at: "2026-09-01T00:00:00Z",
      }],
    });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await expect(
      updateRecognitionCandidate("evt-1", "cand-1", { reviewStatus: "approved" }, "admin-1"),
    ).rejects.toMatchObject({
      message: RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR,
      status: 400,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("allows photo-required approval when a valid preferred source is selected", async () => {
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
    mockTables({
      candidate: baseCandidate({ preferred_source_entry_id: "entry-1" }),
      sources: [{ id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" }],
      entries: [{
        id: "entry-1",
        submission_id: "sub-1",
        event_id: "evt-1",
        event_award_id: "award-1",
        submitted_name: "王小明老師",
        normalized_name: "王小明老師",
        original_photo_storage_path: "recognition/sub-1/entries/entry-1/original.jpg",
        original_photo_mime_type: "image/jpeg",
        original_photo_size_bytes: 1000,
        created_at: "2026-09-01T00:00:00Z",
      }],
      submissions: [{
        id: "sub-1",
        submitter_name: "填報者",
        submitter_organization: "A組",
        submitted_at: "2026-09-01T00:00:00Z",
      }],
    });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await updateRecognitionCandidate("evt-1", "cand-1", { reviewStatus: "approved" }, "admin-1");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch.review_status).toBe("approved");
  });

  it("rejects a preferred photo that is not candidate evidence", async () => {
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
    mockTables({
      candidate: baseCandidate(),
      sources: [{ id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" }],
      entries: [{
        id: "entry-1",
        submission_id: "sub-1",
        event_id: "evt-1",
        event_award_id: "award-1",
        submitted_name: "王小明老師",
        normalized_name: "王小明老師",
        original_photo_storage_path: "recognition/sub-1/entries/entry-1/original.jpg",
        original_photo_mime_type: "image/jpeg",
        original_photo_size_bytes: 1000,
        created_at: "2026-09-01T00:00:00Z",
      }],
      submissions: [{
        id: "sub-1",
        submitter_name: "填報者",
        submitter_organization: "A組",
        submitted_at: "2026-09-01T00:00:00Z",
      }],
    });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await expect(
      updateRecognitionCandidate("evt-1", "cand-1", { preferredSourceEntryId: "entry-foreign" }, "admin-1"),
    ).rejects.toMatchObject({
      message: "preferred photo must belong to this candidate's evidence.",
      status: 400,
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("resets presentation crop when preferred source changes", async () => {
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
    mockTables({
      candidate: baseCandidate({ preferred_source_entry_id: "entry-1" }),
      sources: [
        { id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" },
        { id: "src-2", candidate_id: "cand-1", submission_entry_id: "entry-2", created_at: "2026-09-01T00:00:00Z" },
      ],
      entries: [
        {
          id: "entry-1",
          submission_id: "sub-1",
          event_id: "evt-1",
          event_award_id: "award-1",
          submitted_name: "王小明老師",
          normalized_name: "王小明老師",
          original_photo_storage_path: "recognition/sub-1/entries/entry-1/original.jpg",
          original_photo_mime_type: "image/jpeg",
          original_photo_size_bytes: 1000,
          created_at: "2026-09-01T00:00:00Z",
        },
        {
          id: "entry-2",
          submission_id: "sub-1",
          event_id: "evt-1",
          event_award_id: "award-1",
          submitted_name: "王小明老師",
          normalized_name: "王小明老師",
          original_photo_storage_path: "recognition/sub-1/entries/entry-2/original.jpg",
          original_photo_mime_type: "image/jpeg",
          original_photo_size_bytes: 1000,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      submissions: [{
        id: "sub-1",
        submitter_name: "填報者",
        submitter_organization: "A組",
        submitted_at: "2026-09-01T00:00:00Z",
      }],
    });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await updateRecognitionCandidate("evt-1", "cand-1", { preferredSourceEntryId: "entry-2" }, "admin-1");
    expect(mockRpc).toHaveBeenCalledWith("reset_recognition_candidate_photo_review", {
      p_candidate_id: "cand-1",
    });
    expect(updateCalls[0]?.patch).not.toHaveProperty("original_photo_storage_path");
  });

  it("does not reset presentation crop when only the display name changes", async () => {
    mockTables({ candidate: baseCandidate({ display_name: "王小明老師" }) });
    const { updateRecognitionCandidate } = await import("./recognition-candidate-service");
    await updateRecognitionCandidate("evt-1", "cand-1", { displayName: "王小明" }, "admin-1");
    expect(updateCalls[0]?.patch.display_name).toBe("王小明");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
