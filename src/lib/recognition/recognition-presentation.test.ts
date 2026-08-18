import { describe, expect, it } from "vitest";
import { buildRecognitionPresentationData } from "@/lib/recognition/recognition-presentation-dto";
import { normalizedCropToPixelRect } from "@/lib/recognition/recognition-presentation-crop";
import {
  recognitionPresentationAsciiFallbackFilename,
  recognitionPresentationFilename,
  sanitizeRecognitionPresentationFilename,
} from "@/lib/recognition/recognition-presentation-filename";
import {
  estimateRecognitionPresentationSlideCount,
  fitRecognitionPresentationName,
  nameListColumnCount,
  photoGridRowPattern,
  photoLayoutTypeForCount,
  planRecognitionPresentation,
  RECOGNITION_NAME_LIST_LAYOUT,
  RECOGNITION_PHOTO_GRID_MAX_PER_PAGE,
  RECOGNITION_PPTX_SLIDE,
} from "@/lib/recognition/recognition-presentation-layout";
import {
  formatRecognitionPresentationNotReadyError,
  listRecognitionPresentationPhotoBlockers,
  RECOGNITION_PRESENTATION_BLOCKER_LABELS,
} from "@/lib/recognition/recognition-presentation-readiness";
import { RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG } from "@/lib/recognition/recognition-presentation-types";
import type {
  RecognitionPresentationDtoAwardInput,
  RecognitionPresentationDtoCandidateInput,
  RecognitionPresentationDtoReviewInput,
} from "@/lib/recognition/recognition-presentation-dto";
import type { RecognitionPhotoReview } from "@/types/recognition";

const CROP = { x: 0.1, y: 0.05, width: 0.45, height: 0.6 };

function award(
  overrides: Partial<RecognitionPresentationDtoAwardInput> & Pick<RecognitionPresentationDtoAwardInput, "eventAwardId" | "awardSlug" | "awardName">,
): RecognitionPresentationDtoAwardInput {
  return {
    sortOrder: 1,
    isEnabled: true,
    requiresPhoto: false,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<RecognitionPresentationDtoCandidateInput> & Pick<RecognitionPresentationDtoCandidateInput, "id" | "eventAwardId" | "displayName">,
): RecognitionPresentationDtoCandidateInput {
  const sourceId = overrides.preferredSourceEntryId ?? `${overrides.id}-src`;
  const hasPhoto = overrides.hasOriginalPhoto ?? false;
  return {
    reviewStatus: "approved",
    sortOrder: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    preferredSourceEntryId: hasPhoto ? sourceId : null,
    hasOriginalPhoto: hasPhoto,
    sources: hasPhoto
      ? [{
          submissionEntryId: sourceId,
          originalPhotoStoragePath: `recognition/${overrides.id}.jpg`,
          originalPhotoMimeType: "image/jpeg",
          hasOriginalPhoto: true,
        }]
      : [],
    ...overrides,
  };
}

function review(overrides: Partial<RecognitionPhotoReview> & { candidateId: string }): RecognitionPhotoReview {
  return {
    id: `review-${overrides.candidateId}`,
    sourceEntryId: `${overrides.candidateId}-src`,
    originalWidth: 1200,
    originalHeight: 1600,
    crop: CROP,
    cropAspectRatio: "3:4",
    flags: [],
    isBlocked: false,
    blockedReason: null,
    cropFinalizedAt: "2026-08-01T00:00:00.000Z",
    cropFinalizedByMemberId: "admin-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function build(input: {
  awards: RecognitionPresentationDtoAwardInput[];
  candidates: RecognitionPresentationDtoCandidateInput[];
  reviews?: RecognitionPhotoReview[];
  event?: { id?: string; name?: string; year?: number; month?: number };
}) {
  const reviews = new Map((input.reviews ?? []).map((item) => [item.candidateId, item]));
  return buildRecognitionPresentationData({
    event: {
      id: input.event?.id ?? "evt-1",
      name: input.event?.name ?? "月會",
      year: input.event?.year ?? 2026,
      month: input.event?.month ?? 9,
    },
    awards: input.awards,
    candidates: input.candidates,
    reviews,
  });
}

describe("Recognition presentation DTO", () => {
  it("only includes approved candidates", () => {
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [
        candidate({ id: "c-approved", eventAwardId: "a1", displayName: "王小明", reviewStatus: "approved" }),
        candidate({ id: "c-pending", eventAwardId: "a1", displayName: "李小華", reviewStatus: "pending" }),
        candidate({ id: "c-rejected", eventAwardId: "a1", displayName: "陳大明", reviewStatus: "rejected" }),
      ],
    });
    expect(data.awards).toHaveLength(1);
    expect(data.awards[0]?.candidates.map((item) => item.displayName)).toEqual(["王小明"]);
  });

  it("extracts a Supabase Storage object path from a full photo URL", () => {
    const storagePath = "recognition/c-photo.jpg";
    const data = build({
      awards: [award({
        eventAwardId: "a3",
        awardSlug: "new_world_team_pass",
        awardName: "新科世界組",
        requiresPhoto: true,
      })],
      candidates: [candidate({
        id: "c-photo",
        eventAwardId: "a3",
        displayName: "王小明",
        hasOriginalPhoto: true,
        sources: [{
          submissionEntryId: "c-photo-src",
          originalPhotoStoragePath: `https://xyz.supabase.co/storage/v1/object/public/recognition-photos/${storagePath}`,
          originalPhotoMimeType: "image/jpeg",
          hasOriginalPhoto: true,
        }],
      })],
      reviews: [review({ candidateId: "c-photo" })],
    });
    expect(data.awards[0]?.candidates[0]?.photo?.storagePath).toBe(storagePath);
  });

  it("omits a malformed photo ref instead of putting it on the slide DTO", () => {
    const data = build({
      awards: [award({
        eventAwardId: "a3",
        awardSlug: "new_world_team_pass",
        awardName: "新科世界組",
        requiresPhoto: true,
      })],
      candidates: [candidate({
        id: "c-photo",
        eventAwardId: "a3",
        displayName: "王小明",
        hasOriginalPhoto: true,
        sources: [{
          submissionEntryId: "c-photo-src",
          originalPhotoStoragePath: "not a url",
          originalPhotoMimeType: "image/jpeg",
          hasOriginalPhoto: true,
        }],
      })],
      reviews: [review({ candidateId: "c-photo" })],
    });
    expect(data.awards[0]?.candidates[0]?.photo).toBeNull();
  });

  it("omits disabled awards even when they have approved candidates", () => {
    const data = build({
      awards: [
        award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月", isEnabled: false }),
      ],
      candidates: [candidate({ id: "c1", eventAwardId: "a1", displayName: "王小明" })],
    });
    expect(data.awards).toEqual([]);
  });

  it("omits enabled awards with zero approved recipients", () => {
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [
        candidate({ id: "c1", eventAwardId: "a1", displayName: "王小明", reviewStatus: "pending" }),
      ],
    });
    expect(data.awards).toEqual([]);
    expect(planRecognitionPresentation(data)).toEqual([]);
  });

  it("preserves event award order instead of global catalog order", () => {
    const data = build({
      awards: [
        award({ eventAwardId: "lifetime", awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG, awardName: "百萬終生成就獎", sortOrder: 1, requiresPhoto: true }),
        award({ eventAwardId: "map1", awardSlug: "map_month_1", awardName: "MAP 第一個月", sortOrder: 2 }),
      ],
      candidates: [
        candidate({ id: "c-map", eventAwardId: "map1", displayName: "MAP人", sortOrder: 1 }),
        candidate({
          id: "c-life",
          eventAwardId: "lifetime",
          displayName: "成就人",
          sortOrder: 1,
          hasOriginalPhoto: true,
          preferredSourceEntryId: "c-life-src",
        }),
      ],
      reviews: [review({ candidateId: "c-life" })],
    });
    expect(data.awards.map((item) => item.awardSlug)).toEqual([
      RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG,
      "map_month_1",
    ]);
  });

  it("preserves Phase 5 candidate ordering", () => {
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [
        candidate({ id: "c-b", eventAwardId: "a1", displayName: "第二位", sortOrder: 20 }),
        candidate({ id: "c-a", eventAwardId: "a1", displayName: "第一位", sortOrder: 10 }),
      ],
    });
    expect(data.awards[0]?.candidates.map((item) => item.displayName)).toEqual(["第一位", "第二位"]);
  });

  it("keeps same-month events independent", () => {
    const first = build({
      event: { id: "evt-a", name: "北區月會", year: 2026, month: 9 },
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [candidate({ id: "c1", eventAwardId: "a1", displayName: "北區王" })],
    });
    const second = build({
      event: { id: "evt-b", name: "南區月會", year: 2026, month: 9 },
      awards: [award({ eventAwardId: "b1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [candidate({ id: "c2", eventAwardId: "b1", displayName: "南區李" })],
    });
    expect(first.event.id).not.toBe(second.event.id);
    expect(first.awards[0]?.candidates[0]?.displayName).toBe("北區王");
    expect(second.awards[0]?.candidates[0]?.displayName).toBe("南區李");
    expect(recognitionPresentationFilename(first.event)).toContain("北區月會");
    expect(recognitionPresentationFilename(second.event)).toContain("南區月會");
  });
});

describe("Recognition presentation slide planner", () => {
  it("plans a spacious name-only slide for few names", () => {
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: ["甲", "乙", "丙"].map((name, index) => candidate({
        id: `c${index}`,
        eventAwardId: "a1",
        displayName: name,
        sortOrder: index + 1,
      })),
    });
    const plan = planRecognitionPresentation(data);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.layoutType).toBe("name_list");
    expect(nameListColumnCount(plan[0]?.candidateIds.length ?? 0)).toBe(1);
  });

  it("paginates name-only awards using layout config, not a frozen business rule", () => {
    expect(RECOGNITION_NAME_LIST_LAYOUT.maxNamesPerPage).toBe(18);
    const names = Array.from({ length: 19 }, (_, index) => `成員${index + 1}`);
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: names.map((name, index) => candidate({
        id: `c${index}`,
        eventAwardId: "a1",
        displayName: name,
        sortOrder: index + 1,
      })),
    });
    const plan = planRecognitionPresentation(data);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.candidateIds).toHaveLength(18);
    expect(plan[1]?.candidateIds).toHaveLength(1);
    expect(plan[0]?.awardName).toBe("MAP 第一個月");
    expect(plan[1]?.awardName).toBe("MAP 第一個月");
    expect(plan[1]?.pageIndex).toBe(2);
  });

  it("uses hero 1/2/3 and photo grid for 4-12 people", () => {
    function planPhoto(count: number) {
      const data = build({
        awards: [award({ eventAwardId: "a1", awardSlug: "new_supervisor", awardName: "新科督導", requiresPhoto: true })],
        candidates: Array.from({ length: count }, (_, index) => candidate({
          id: `c${index}`,
          eventAwardId: "a1",
          displayName: `督導${index + 1}`,
          sortOrder: index + 1,
          hasOriginalPhoto: true,
          preferredSourceEntryId: `c${index}-src`,
        })),
        reviews: Array.from({ length: count }, (_, index) => review({ candidateId: `c${index}` })),
      });
      return planRecognitionPresentation(data);
    }

    expect(planPhoto(1)[0]?.layoutType).toBe("photo_hero_1");
    expect(planPhoto(2)[0]?.layoutType).toBe("photo_hero_2");
    expect(planPhoto(3)[0]?.layoutType).toBe("photo_hero_3");
    expect(planPhoto(4)[0]?.layoutType).toBe("photo_grid");
    expect(planPhoto(12)).toHaveLength(1);
    expect(planPhoto(12)[0]?.candidateIds).toHaveLength(12);
    expect(photoGridRowPattern(12)).toEqual([4, 4, 4]);
    expect(RECOGNITION_PHOTO_GRID_MAX_PER_PAGE).toBe(12);
  });

  it("paginates 13 as 12 + hero 1 and 17 as 12 + 5", () => {
    function planPhoto(count: number) {
      const data = build({
        awards: [award({ eventAwardId: "a1", awardSlug: "new_supervisor", awardName: "新科督導", requiresPhoto: true })],
        candidates: Array.from({ length: count }, (_, index) => candidate({
          id: `c${index}`,
          eventAwardId: "a1",
          displayName: `督導${index + 1}`,
          sortOrder: index + 1,
          hasOriginalPhoto: true,
          preferredSourceEntryId: `c${index}-src`,
        })),
        reviews: Array.from({ length: count }, (_, index) => review({ candidateId: `c${index}` })),
      });
      return planRecognitionPresentation(data);
    }

    const thirteen = planPhoto(13);
    expect(thirteen).toHaveLength(2);
    expect(thirteen[0]?.candidateIds).toHaveLength(12);
    expect(thirteen[1]?.candidateIds).toHaveLength(1);
    expect(thirteen[1]?.layoutType).toBe("photo_hero_1");

    const seventeen = planPhoto(17);
    expect(seventeen).toHaveLength(2);
    expect(seventeen[0]?.candidateIds).toHaveLength(12);
    expect(seventeen[1]?.candidateIds).toHaveLength(5);
    expect(seventeen[1]?.layoutType).toBe("photo_grid");
    expect(photoLayoutTypeForCount(5)).toBe("photo_grid");
  });

  it("uses the lifetime achievement layout keyed by slug", () => {
    const data = build({
      awards: [award({
        eventAwardId: "life",
        awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG,
        awardName: "百萬終生成就獎",
        requiresPhoto: true,
      })],
      candidates: [
        candidate({
          id: "c1",
          eventAwardId: "life",
          displayName: "終身得主",
          hasOriginalPhoto: true,
          preferredSourceEntryId: "c1-src",
        }),
        candidate({
          id: "c2",
          eventAwardId: "life",
          displayName: "第二位終身得主",
          sortOrder: 2,
          hasOriginalPhoto: true,
          preferredSourceEntryId: "c2-src",
        }),
      ],
      reviews: [review({ candidateId: "c1" }), review({ candidateId: "c2" })],
    });
    const plan = planRecognitionPresentation(data);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.layoutType).toBe("lifetime_achievement");
    expect(plan[0]?.awardSlug).toBe(RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG);
    expect(plan[0]?.candidateIds).toHaveLength(2);
  });

  it("matches the slide-count estimator to the plan", () => {
    const data = build({
      awards: [
        award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" }),
        award({ eventAwardId: "a2", awardSlug: "new_supervisor", awardName: "新科督導", requiresPhoto: true, sortOrder: 2 }),
      ],
      candidates: [
        ...Array.from({ length: 19 }, (_, index) => candidate({
          id: `n${index}`,
          eventAwardId: "a1",
          displayName: `名單${index + 1}`,
          sortOrder: index + 1,
        })),
        ...Array.from({ length: 13 }, (_, index) => candidate({
          id: `p${index}`,
          eventAwardId: "a2",
          displayName: `照片${index + 1}`,
          sortOrder: index + 1,
          hasOriginalPhoto: true,
          preferredSourceEntryId: `p${index}-src`,
        })),
      ],
      reviews: Array.from({ length: 13 }, (_, index) => review({ candidateId: `p${index}` })),
    });
    const plan = planRecognitionPresentation(data);
    expect(estimateRecognitionPresentationSlideCount(data)).toBe(plan.length);
    expect(plan.length).toBe(4);
  });

  it("creates zero slides for an empty award set", () => {
    const data = build({
      awards: [award({ eventAwardId: "a1", awardSlug: "map_month_1", awardName: "MAP 第一個月" })],
      candidates: [],
    });
    expect(planRecognitionPresentation(data)).toEqual([]);
  });
});

describe("Recognition presentation long names and 4:3 size", () => {
  it("does not silently drop or ellipsize long names", () => {
    const name = "王小明老師督導組非常長的表揚姓名加上 English Honorific Jr.";
    const fitted = fitRecognitionPresentationName(name);
    expect(fitted.text).toBe(name);
    expect(fitted.text.includes("…")).toBe(false);
    expect(fitted.text.includes("...")).toBe(false);
    expect(fitted.fontSizePt).toBeLessThan(RECOGNITION_NAME_LIST_LAYOUT.baseFontSizePt);
    expect(fitted.fontSizePt).toBeGreaterThanOrEqual(RECOGNITION_NAME_LIST_LAYOUT.minFontSizePt);
  });

  it("documents the 4:3 slide size used by the generator", () => {
    expect(RECOGNITION_PPTX_SLIDE.widthIn / RECOGNITION_PPTX_SLIDE.heightIn).toBeCloseTo(4 / 3, 8);
    expect(RECOGNITION_PPTX_SLIDE.widthIn).toBe(10);
    expect(RECOGNITION_PPTX_SLIDE.heightIn).toBe(7.5);
    expect(RECOGNITION_PPTX_SLIDE.widthEmu).toBe(9144000);
    expect(RECOGNITION_PPTX_SLIDE.heightEmu).toBe(6858000);
  });
});

describe("Recognition presentation crop geometry", () => {
  it("converts normalized crop coordinates without recentering", () => {
    const rect = normalizedCropToPixelRect({
      originalWidth: 1000,
      originalHeight: 2000,
      crop: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
    });
    expect(rect).toEqual({ left: 200, top: 200, width: 300, height: 800 });
    const shifted = normalizedCropToPixelRect({
      originalWidth: 1000,
      originalHeight: 2000,
      crop: { x: 0.4, y: 0.1, width: 0.3, height: 0.4 },
    });
    expect(shifted.left).toBe(400);
    expect(shifted.top).toBe(200);
  });
});

describe("Recognition presentation readiness gate", () => {
  const photoCandidate = {
    id: "c1",
    displayName: "王小明",
    reviewStatus: "approved" as const,
    requiresPhoto: true,
    hasOriginalPhoto: true,
    preferredSourceEntryId: "src-1",
    preferredSourceBelongsToCandidate: true,
    preferredSourceHasOriginalPhoto: true,
    photoReview: {
      sourceEntryId: "src-1",
      crop: CROP,
      isBlocked: false,
    } satisfies RecognitionPresentationDtoReviewInput,
  };

  it("blocks required-photo candidates without an original", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{ ...photoCandidate, hasOriginalPhoto: false, preferredSourceEntryId: null, photoReview: null }],
    });
    expect(blockers[0]?.reason).toBe(RECOGNITION_PRESENTATION_BLOCKER_LABELS.noOriginalPhoto);
  });

  it("blocks when preferred source is missing", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{ ...photoCandidate, preferredSourceEntryId: null, photoReview: null }],
    });
    expect(blockers[0]?.reason).toBe(RECOGNITION_PRESENTATION_BLOCKER_LABELS.preferredNotSelected);
  });

  it("blocks when crop is missing", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{ ...photoCandidate, photoReview: { sourceEntryId: "src-1", crop: null, isBlocked: false } }],
    });
    expect(blockers[0]?.reason).toBe(RECOGNITION_PRESENTATION_BLOCKER_LABELS.noCrop);
  });

  it("blocks photo_blocked candidates", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{
        ...photoCandidate,
        photoReview: { sourceEntryId: "src-1", crop: CROP, isBlocked: true, blockedReason: "照片已標記為不可使用" },
      }],
    });
    expect(blockers[0]?.reason).toBe("照片已標記為不可使用");
  });

  it("allows generation when the crop is valid", () => {
    expect(listRecognitionPresentationPhotoBlockers({ candidates: [photoCandidate] })).toEqual([]);
  });

  it("does not require a photo for name-only candidates", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{
        id: "n1",
        displayName: "名單人",
        reviewStatus: "approved",
        requiresPhoto: false,
        hasOriginalPhoto: false,
        preferredSourceEntryId: null,
        photoReview: null,
      }],
    });
    expect(blockers).toEqual([]);
  });

  it("blocks when a preferred-source change invalidated the crop", () => {
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{
        ...photoCandidate,
        preferredSourceEntryId: "src-2",
        photoReview: { sourceEntryId: "src-1", crop: CROP, isBlocked: false },
      }],
    });
    expect(blockers[0]?.reason).toBe(RECOGNITION_PRESENTATION_BLOCKER_LABELS.cropSourceMismatch);
  });

  it("formats a useful Chinese product error", () => {
    const message = formatRecognitionPresentationNotReadyError([
      { candidateId: "1", displayName: "王小明", reason: "尚未裁切" },
      { candidateId: "2", displayName: "李小華", reason: "尚未選擇正式照片" },
      { candidateId: "3", displayName: "陳大明", reason: "照片已標記為不可使用" },
    ]);
    expect(message).toContain("無法產生簡報，尚有 3 個照片問題需要處理：");
    expect(message).toContain("- 王小明：尚未裁切");
    expect(message).toContain("- 李小華：尚未選擇正式照片");
    expect(message).toContain("- 陳大明：照片已標記為不可使用");
  });
});

describe("Recognition presentation filename", () => {
  it("sanitizes unsafe characters and keeps event names", () => {
    expect(sanitizeRecognitionPresentationFilename('2026-09-月會:*?/"<>|-表揚名單.pptx')).toBe(
      "2026-09-月會-表揚名單.pptx",
    );
    expect(recognitionPresentationFilename({ year: 2026, month: 9, name: "月會" })).toBe(
      "2026-09-月會-表揚名單.pptx",
    );
    expect(recognitionPresentationAsciiFallbackFilename("2026-09-月會-表揚名單.pptx")).toBe(
      "2026-09-.pptx",
    );
  });
});
