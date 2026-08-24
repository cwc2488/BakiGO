import { describe, expect, it } from "vitest";
import { normalizeRecognitionSubmittedName } from "@/lib/recognition/recognition-domain";
import {
  buildRecognitionApprovedRoster,
  compareRecognitionCandidateOrder,
  detectRecognitionCandidateWarnings,
  findRecognitionDisplayNameCollision,
  formatRecognitionTextRoster,
  groupEntriesForRecognitionConsolidation,
  recognitionCandidatePhotoReadiness,
  recognitionConsolidationKey,
  recognitionSuspectedDuplicateKey,
  RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR,
  textRosterContainsInternalId,
  validateRecognitionPhotoRequiredApproval,
  validateRecognitionPreferredPhotoSource,
  validateRecognitionReviewStatus,
} from "@/lib/recognition/recognition-candidates";

describe("Recognition candidate consolidation", () => {
  it("same event + award + normalized_name consolidates", () => {
    const groups = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "b" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "c" },
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get(recognitionConsolidationKey({
      eventId: "evt-1",
      eventAwardId: "award-1",
      normalizedName: "王小明",
    }))).toHaveLength(3);
  });

  it("preserves all raw source ids in a consolidation group", () => {
    const groups = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "b" },
    ]);
    const [group] = [...groups.values()];
    expect(group?.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("idempotent grouping does not invent extra candidates", () => {
    const entries = [
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
    ];
    expect(groupEntriesForRecognitionConsolidation(entries).size).toBe(1);
    expect(groupEntriesForRecognitionConsolidation(entries).size).toBe(1);
  });

  it("new matching raw entry attaches to the existing group", () => {
    const first = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
    ]);
    const second = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "b" },
    ]);
    const key = recognitionConsolidationKey({
      eventId: "evt-1",
      eventAwardId: "award-1",
      normalizedName: "王小明",
    });
    expect(first.get(key)).toHaveLength(1);
    expect(second.get(key)).toHaveLength(2);
  });

  it("same name across different awards does not merge", () => {
    const groups = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-2", normalizedName: "王小明", id: "b" },
    ]);
    expect(groups.size).toBe(2);
  });

  it("does not strip honorifics during normalization, so 王小明 and 王小明老師 stay separate", () => {
    expect(normalizeRecognitionSubmittedName("王小明老師")).toBe("王小明老師");
    const groups = groupEntriesForRecognitionConsolidation([
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明", id: "a" },
      { eventId: "evt-1", eventAwardId: "award-1", normalizedName: "王小明老師", id: "b" },
    ]);
    expect(groups.size).toBe(2);
  });
});

describe("Recognition candidate warnings", () => {
  it("cross-award duplicate produces a warning only", () => {
    const warnings = detectRecognitionCandidateWarnings([
      { id: "c1", eventAwardId: "a1", awardName: "MAP 第一個月", displayName: "王小明", normalizedName: "王小明" },
      { id: "c2", eventAwardId: "a2", awardName: "MAP 第二個月", displayName: "王小明", normalizedName: "王小明" },
    ]);
    expect(warnings.get("c1")?.crossAwardMatches).toHaveLength(1);
    expect(warnings.get("c1")?.crossAwardMatches[0]?.awardName).toBe("MAP 第二個月");
    expect(warnings.get("c1")?.suspectedDuplicates).toHaveLength(0);
  });

  it("suspected duplicate never auto-merges", () => {
    expect(recognitionSuspectedDuplicateKey("王小明老師")).toBe("王小明");
    expect(recognitionSuspectedDuplicateKey("張 小華")).toBe("張小華");
    const warnings = detectRecognitionCandidateWarnings([
      { id: "c1", eventAwardId: "a1", awardName: "MAP 第一個月", displayName: "王小明", normalizedName: "王小明" },
      { id: "c2", eventAwardId: "a1", awardName: "MAP 第一個月", displayName: "王小明老師", normalizedName: "王小明老師" },
    ]);
    expect(warnings.get("c1")?.suspectedDuplicates).toHaveLength(1);
    expect(groupEntriesForRecognitionConsolidation([
      { eventId: "e", eventAwardId: "a1", normalizedName: "王小明", id: "1" },
      { eventId: "e", eventAwardId: "a1", normalizedName: "王小明老師", id: "2" },
    ]).size).toBe(2);
  });
});

describe("Recognition candidate rename and photo selection", () => {
  it("canonical name can be edited independently of raw submitted_name", () => {
    const raw = "王小明老師";
    const nextDisplay = "王小明";
    expect(raw).toBe("王小明老師");
    expect(nextDisplay).not.toBe(raw);
  });

  it("candidate rename collision does not silently merge", () => {
    const collision = findRecognitionDisplayNameCollision({
      candidateId: "c1",
      eventAwardId: "a1",
      nextDisplayName: "王小明",
      candidates: [
        { id: "c1", eventAwardId: "a1", displayName: "王小明老師" },
        { id: "c2", eventAwardId: "a1", displayName: "王小明" },
      ],
    });
    expect(collision?.id).toBe("c2");
  });

  it("preferred photo must come from candidate evidence", () => {
    expect(validateRecognitionPreferredPhotoSource({
      preferredSourceEntryId: "entry-2",
      sourceEntryIds: ["entry-1"],
      photoSourceEntryIds: ["entry-1"],
    })).not.toBeNull();
    expect(validateRecognitionPreferredPhotoSource({
      preferredSourceEntryId: "entry-1",
      sourceEntryIds: ["entry-1"],
      photoSourceEntryIds: ["entry-1"],
    })).toBeNull();
  });
});

describe("Recognition photo-required approval", () => {
  const photoEvidence = {
    sourceEntryIds: ["entry-1"],
    photoSourceEntryIds: ["entry-1"],
  };

  it("photo-required candidate with no original photo cannot be approved", () => {
    expect(validateRecognitionPhotoRequiredApproval({
      requiresPhoto: true,
      preferredSourceEntryId: null,
      sourceEntryIds: ["entry-1"],
      photoSourceEntryIds: [],
    })).toBe(RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR);
  });

  it("photo-required candidate with original photo but no preferred source cannot be approved", () => {
    expect(validateRecognitionPhotoRequiredApproval({
      requiresPhoto: true,
      preferredSourceEntryId: null,
      ...photoEvidence,
    })).toBe(RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR);
  });

  it("photo-required candidate with valid preferred photo can be approved", () => {
    expect(validateRecognitionPhotoRequiredApproval({
      requiresPhoto: true,
      preferredSourceEntryId: "entry-1",
      ...photoEvidence,
    })).toBeNull();
  });

  it("name-only candidate can be approved without photo", () => {
    expect(validateRecognitionPhotoRequiredApproval({
      requiresPhoto: false,
      preferredSourceEntryId: null,
      sourceEntryIds: [],
      photoSourceEntryIds: [],
    })).toBeNull();
  });

  it("does not treat hasOriginalPhoto as photo-ready without a preferred source", () => {
    expect(recognitionCandidatePhotoReadiness({
      requiresPhoto: true,
      hasOriginalPhoto: true,
      preferredSourceEntryId: null,
    })).toBe("needs_preferred_selection");
    expect(recognitionCandidatePhotoReadiness({
      requiresPhoto: true,
      hasOriginalPhoto: false,
      preferredSourceEntryId: null,
    })).toBe("missing_photo");
  });
});

describe("Recognition review states", () => {
  it("accepts approve / needs_fix / reject / pending", () => {
    expect(validateRecognitionReviewStatus("approved")).toBeNull();
    expect(validateRecognitionReviewStatus("needs_fix")).toBeNull();
    expect(validateRecognitionReviewStatus("rejected")).toBeNull();
    expect(validateRecognitionReviewStatus("pending")).toBeNull();
  });
});

describe("Recognition approved roster and text export", () => {
  const roster = buildRecognitionApprovedRoster({
    eventId: "evt-1",
    eventName: "月會表揚名單",
    year: 2026,
    month: 9,
    awards: [
      { eventAwardId: "a1", awardName: "MAP 第一個月", sortOrder: 1, isEnabled: true, requiresPhoto: false },
      { eventAwardId: "a2", awardName: "MAP 第二個月", sortOrder: 2, isEnabled: true, requiresPhoto: false },
      { eventAwardId: "a3", awardName: "新科世界組", sortOrder: 3, isEnabled: true, requiresPhoto: true },
    ],
    candidates: [
      { id: "c-pending", eventAwardId: "a1", reviewStatus: "pending", displayName: "不該出現", sortOrder: 1, createdAt: "2026-09-01T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
      { id: "c-fix", eventAwardId: "a1", reviewStatus: "needs_fix", displayName: "需修正", sortOrder: 2, createdAt: "2026-09-01T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
      { id: "c-rej", eventAwardId: "a1", reviewStatus: "rejected", displayName: "已拒絕", sortOrder: 3, createdAt: "2026-09-01T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
      { id: "c-b", eventAwardId: "a1", reviewStatus: "approved", displayName: "陳小華", sortOrder: 2, createdAt: "2026-09-02T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
      { id: "c-a", eventAwardId: "a1", reviewStatus: "approved", displayName: "王小明", sortOrder: 1, createdAt: "2026-09-01T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
      { id: "c-c", eventAwardId: "a2", reviewStatus: "approved", displayName: "張大明", sortOrder: 1, createdAt: "2026-09-01T00:00:00Z", preferredSourceEntryId: null, hasOriginalPhoto: false },
    ],
  });

  it("approved roster contains approved only", () => {
    const names = roster.awards.flatMap((award) => award.candidates.map((candidate) => candidate.displayName));
    expect(names).toEqual(["王小明", "陳小華", "張大明"]);
  });

  it("pending, needs_fix, and rejected are excluded", () => {
    const names = roster.awards.flatMap((award) => award.candidates.map((candidate) => candidate.displayName));
    expect(names).not.toContain("不該出現");
    expect(names).not.toContain("需修正");
    expect(names).not.toContain("已拒絕");
  });

  it("preserves award order and deterministic candidate order", () => {
    expect(roster.awards.map((award) => award.awardName)).toEqual([
      "MAP 第一個月",
      "MAP 第二個月",
      "新科世界組",
    ]);
    expect(compareRecognitionCandidateOrder(
      { sortOrder: 1, createdAt: "1", displayName: "A" },
      { sortOrder: 2, createdAt: "0", displayName: "B" },
    )).toBeLessThan(0);
  });

  it("text roster omits empty awards and contains no internal ids", () => {
    const text = formatRecognitionTextRoster(roster);
    expect(text).toContain("2026 年 9 月 月會表揚名單");
    expect(text).toContain("MAP 第一個月");
    expect(text).toContain("王小明");
    expect(text).not.toContain("新科世界組");
    expect(text).not.toContain("c-a");
    expect(textRosterContainsInternalId(text)).toBe(false);
  });

  it("keeps same-month events independent by eventId", () => {
    const other = buildRecognitionApprovedRoster({
      ...roster,
      eventId: "evt-2",
      eventName: "STS",
      awards: roster.awards.map((award) => ({ ...award, isEnabled: true })),
      candidates: [],
    });
    expect(other.eventId).not.toBe(roster.eventId);
    expect(formatRecognitionTextRoster(other)).toContain("STS");
    expect(formatRecognitionTextRoster(other)).not.toContain("王小明");
  });

  it("keeps approved photo-required rows on the roster even without a preferred source", () => {
    const inconsistent = buildRecognitionApprovedRoster({
      eventId: "evt-1",
      eventName: "月會",
      year: 2026,
      month: 9,
      awards: [
        { eventAwardId: "a3", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
      ],
      candidates: [
        {
          id: "legacy",
          eventAwardId: "a3",
          reviewStatus: "approved",
          displayName: "王小明",
          sortOrder: 1,
          createdAt: "2026-09-01T00:00:00Z",
          preferredSourceEntryId: null,
          hasOriginalPhoto: true,
        },
      ],
    });
    expect(inconsistent.awards[0]?.candidates).toHaveLength(1);
    expect(inconsistent.awards[0]?.requiresPhoto).toBe(true);
    expect(inconsistent.awards[0]?.candidates[0]?.hasPreferredPhoto).toBe(false);
    expect(inconsistent.awards[0]?.candidates[0]?.preferredSourceEntryId).toBeNull();
    expect(inconsistent.awards[0]?.candidates[0]?.photoReady).toBe(false);
    expect(inconsistent.awards[0]?.candidates[0]?.hasPresentationCrop).toBe(false);
  });
});
