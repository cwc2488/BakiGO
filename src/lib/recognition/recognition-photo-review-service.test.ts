import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR } from "@/lib/recognition/recognition-photo-review";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

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

const candidateRow = {
  id: "cand-1",
  event_id: "evt-1",
  event_award_id: "award-1",
  display_name: "王小明",
  normalized_name: "王小明",
  review_status: "approved",
  member_id: null,
  preferred_source_entry_id: "entry-1",
  sort_order: 1,
  reviewed_at: null,
  reviewed_by_member_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function mockCandidateTables(preferred = "entry-1") {
  mockFrom.mockImplementation((table: string) => {
    if (table === "recognition_candidates") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [{ ...candidateRow, preferred_source_entry_id: preferred }], error: null }),
          }),
        }),
      };
    }
    if (table === "recognition_candidate_sources") {
      return chain([{ id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" }]);
    }
    if (table === "recognition_submission_entries") {
      return chain([{
        id: "entry-1",
        submission_id: "sub-1",
        event_id: "evt-1",
        event_award_id: "award-1",
        submitted_name: "王小明",
        normalized_name: "王小明",
        original_photo_storage_path: "recognition/sub-1/entries/entry-1/original.jpg",
        original_photo_mime_type: "image/jpeg",
        original_photo_size_bytes: 1000,
        created_at: "2026-09-01T00:00:00Z",
      }]);
    }
    if (table === "recognition_submissions") {
      return chain([{ id: "sub-1", submitter_name: "填報者", submitter_organization: "A組", submitted_at: "2026-09-01T00:00:00Z" }]);
    }
    if (table === "recognition_candidate_photo_reviews") {
      return chain([]);
    }
    return chain([]);
  });
}

describe("Recognition photo review service", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    getRecognitionEventMock.mockReset();
    listEventAwardsMock.mockReset();
    getRecognitionEventMock.mockResolvedValue({ id: "evt-1", name: "月會", year: 2026, month: 9 });
    listEventAwardsMock.mockResolvedValue([
      { id: "award-1", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
    ]);
  });

  it("rejects a stale crop save after preferred source changes", async () => {
    mockCandidateTables("entry-2");
    mockFrom.mockImplementation((table: string) => {
      if (table === "recognition_candidates") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ ...candidateRow, preferred_source_entry_id: "entry-2" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "recognition_candidate_sources") {
        return chain([
          { id: "src-1", candidate_id: "cand-1", submission_entry_id: "entry-1", created_at: "2026-09-01T00:00:00Z" },
          { id: "src-2", candidate_id: "cand-1", submission_entry_id: "entry-2", created_at: "2026-09-01T00:00:00Z" },
        ]);
      }
      if (table === "recognition_submission_entries") {
        return chain([
          {
            id: "entry-1",
            submission_id: "sub-1",
            event_id: "evt-1",
            event_award_id: "award-1",
            submitted_name: "王小明",
            normalized_name: "王小明",
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
            submitted_name: "王小明",
            normalized_name: "王小明",
            original_photo_storage_path: "recognition/sub-1/entries/entry-2/original.jpg",
            original_photo_mime_type: "image/jpeg",
            original_photo_size_bytes: 1000,
            created_at: "2026-09-01T00:00:00Z",
          },
        ]);
      }
      if (table === "recognition_submissions") {
        return chain([{ id: "sub-1", submitter_name: "填報者", submitter_organization: "A組", submitted_at: "2026-09-01T00:00:00Z" }]);
      }
      return chain([]);
    });
    const { updateRecognitionCandidatePhotoReview } = await import("./recognition-photo-review-service");
    await expect(updateRecognitionCandidatePhotoReview("evt-1", "cand-1", {
      sourceEntryId: "entry-1",
      crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 },
      finalize: true,
    }, "admin-1")).rejects.toMatchObject({
      message: RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR,
      status: 409,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects invalid crop coordinates before writing", async () => {
    mockCandidateTables();
    const { updateRecognitionCandidatePhotoReview } = await import("./recognition-photo-review-service");
    await expect(updateRecognitionCandidatePhotoReview("evt-1", "cand-1", {
      sourceEntryId: "entry-1",
      crop: { x: 0.8, y: 0.1, width: 0.4, height: 0.5 },
      finalize: true,
    }, "admin-1")).rejects.toMatchObject({
      status: 400,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("saves crop metadata through the photo-review RPC without touching original storage paths", async () => {
    mockCandidateTables();
    mockRpc.mockResolvedValue({
      data: { ok: true, review: { candidateId: "cand-1" } },
      error: null,
    });
    const { updateRecognitionCandidatePhotoReview } = await import("./recognition-photo-review-service");
    await updateRecognitionCandidatePhotoReview("evt-1", "cand-1", {
      sourceEntryId: "entry-1",
      crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 },
      flags: ["group_photo"],
      finalize: true,
      originalWidth: 2400,
      originalHeight: 3200,
    }, "admin-1");
    expect(mockRpc).toHaveBeenCalledWith("upsert_recognition_candidate_photo_review", expect.objectContaining({
      p_candidate_id: "cand-1",
      p_source_entry_id: "entry-1",
      p_crop_x: 0.1,
      p_crop_y: 0.1,
      p_crop_width: 0.4,
      p_crop_height: 0.5,
      p_flags: ["group_photo"],
      p_finalize: true,
    }));
    const rpcArgs = mockRpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpcArgs).not.toHaveProperty("original_photo_storage_path");
  });
});
