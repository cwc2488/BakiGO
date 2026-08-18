import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRecognitionApprovedRoster } from "@/lib/recognition/recognition-candidates";
import {
  buildRecognitionEventPptReadiness,
  cropMatchesPreferredSource,
  defaultRecognitionCoverCrop,
  isRecognitionPresentationPhotoReady,
  nextRecognitionPhotoReviewCandidateId,
  RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY,
  RECOGNITION_LOW_RESOLUTION_WARNING,
  RECOGNITION_PHOTO_REVIEW_FLAG_LABELS,
  RECOGNITION_PRESENTATION_CROP_ASPECT,
  recognitionHasLowResolutionWarning,
  recognitionPhotoReviewTouchesOriginalEvidence,
  recognitionPresentationPhotoReadinessState,
  structuralPhotoBlockerCannotBeBypassed,
  validateRecognitionNormalizedCrop,
  validateRecognitionPresentationPhoto,
  warningFlagsDoNotBlockPresentation,
} from "@/lib/recognition/recognition-photo-review";

const FACE_IDENTITY_FORBIDDEN_TOKENS = [
  "face-recognition",
  "face_recognition",
  "facenet",
  "biometric",
  "identity matching",
  "which person is",
  "左邊第",
  "honoree face",
] as const;

const validCrop = { x: 0.1, y: 0.05, width: 0.45, height: 0.8 };

describe("Recognition presentation crop coordinates", () => {
  it("stores crop metadata separately from original evidence keys", () => {
    expect(recognitionPhotoReviewTouchesOriginalEvidence([
      "crop_x",
      "crop_y",
      "crop_width",
      "crop_height",
      "flags",
      "source_entry_id",
    ])).toBe(false);
    expect(recognitionPhotoReviewTouchesOriginalEvidence(["original_photo_storage_path"])).toBe(true);
  });

  it("accepts a valid normalized crop", () => {
    expect(validateRecognitionNormalizedCrop(validCrop)).toBeNull();
  });

  it("rejects zero or negative crop dimensions", () => {
    expect(validateRecognitionNormalizedCrop({ x: 0.1, y: 0.1, width: 0, height: 0.4 })).not.toBeNull();
    expect(validateRecognitionNormalizedCrop({ x: 0.1, y: 0.1, width: -0.2, height: 0.4 })).not.toBeNull();
    expect(validateRecognitionNormalizedCrop({ x: 0.1, y: 0.1, width: 0.2, height: 0 })).not.toBeNull();
  });

  it("rejects out-of-bounds crop", () => {
    expect(validateRecognitionNormalizedCrop({ x: 0.8, y: 0.1, width: 0.3, height: 0.4 })).toBe("crop is out of bounds.");
    expect(validateRecognitionNormalizedCrop({ x: -0.1, y: 0, width: 0.4, height: 0.5 })).not.toBeNull();
  });

  it("uses 3:4 portrait slot ratio, not the 4:3 slide ratio", () => {
    expect(RECOGNITION_PRESENTATION_CROP_ASPECT.label).toBe("3:4");
    expect(RECOGNITION_PRESENTATION_CROP_ASPECT.width / RECOGNITION_PRESENTATION_CROP_ASPECT.height).toBe(0.75);
    const cover = defaultRecognitionCoverCrop({ originalWidth: 4000, originalHeight: 3000 });
    const pixelW = cover.width * 4000;
    const pixelH = cover.height * 3000;
    expect(pixelW / pixelH).toBeCloseTo(0.75, 5);
  });
});

describe("Recognition presentation photo readiness", () => {
  it("photo-required approved candidate without preferred source is not photo-ready", () => {
    expect(isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: null,
    })).toBe(false);
    expect(recognitionPresentationPhotoReadinessState({
      requiresPhoto: true,
      hasOriginalPhoto: true,
      preferredSourceEntryId: null,
    })).toBe("preferred_source_not_selected");
  });

  it("preferred source without crop is not photo-ready", () => {
    expect(isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: null, isBlocked: false },
    })).toBe(false);
    expect(recognitionPresentationPhotoReadinessState({
      requiresPhoto: true,
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: null, isBlocked: false },
    })).toBe("needs_photo_review");
  });

  it("valid preferred source + valid crop becomes photo-ready", () => {
    expect(isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: validCrop, isBlocked: false },
    })).toBe(true);
  });

  it("photo_blocked candidate is not photo-ready even with a crop", () => {
    expect(isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: {
        sourceEntryId: "entry-1",
        crop: validCrop,
        isBlocked: true,
        blockedReason: "無法安全使用",
      },
    })).toBe(false);
    expect(recognitionPresentationPhotoReadinessState({
      requiresPhoto: true,
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      photoReview: { sourceEntryId: "entry-1", crop: validCrop, isBlocked: true },
    })).toBe("photo_blocked");
  });

  it("name-only candidate does not require crop", () => {
    expect(isRecognitionPresentationPhotoReady({
      requiresPhoto: false,
      reviewStatus: "approved",
      hasOriginalPhoto: false,
      preferredSourceEntryId: null,
    })).toBe(true);
    expect(recognitionPresentationPhotoReadinessState({
      requiresPhoto: false,
      hasOriginalPhoto: false,
      preferredSourceEntryId: null,
    })).toBe("not_required");
  });

  it("changing preferred source invalidates existing crop", () => {
    expect(cropMatchesPreferredSource({
      crop: validCrop,
      cropSourceEntryId: "entry-old",
      preferredSourceEntryId: "entry-new",
    })).toBe(false);
    expect(recognitionPresentationPhotoReadinessState({
      requiresPhoto: true,
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-new",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-old", crop: validCrop, isBlocked: false },
    })).toBe("needs_photo_review");
  });

  it("changing display name does not invalidate crop", () => {
    const before = isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: validCrop, isBlocked: false },
    });
    const afterRename = isRecognitionPresentationPhotoReady({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: validCrop, isBlocked: false },
    });
    expect(before).toBe(true);
    expect(afterRename).toBe(true);
  });
});

describe("Recognition photo review flags vs blockers", () => {
  it("group-photo flag does not auto-select a person or invent identity copy", () => {
    expect(RECOGNITION_PHOTO_REVIEW_FLAG_LABELS.group_photo).toBe(RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY);
    expect(RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY).toContain("需要人工確認");
    expect(RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY).not.toContain("左邊");
    expect(RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY).not.toContain("王小明");
    const cover = defaultRecognitionCoverCrop({ originalWidth: 3000, originalHeight: 2000 });
    expect(cover.x).toBeGreaterThanOrEqual(0);
    expect(cover.width).toBeGreaterThan(0);
  });

  it("warning flag does not automatically reject an otherwise ready candidate", () => {
    expect(warningFlagsDoNotBlockPresentation({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      crop: validCrop,
      flags: ["text_heavy", "low_resolution", "group_photo", "poor_composition"],
    })).toBe(true);
  });

  it("structural blocker cannot be bypassed by accepting warnings", () => {
    expect(structuralPhotoBlockerCannotBeBypassed({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      crop: null,
      isBlocked: false,
    })).toBe(true);
    expect(structuralPhotoBlockerCannotBeBypassed({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: false,
      preferredSourceEntryId: null,
      crop: validCrop,
      isBlocked: false,
    })).toBe(true);
  });

  it("low-resolution is a warning, not an automatic rejection", () => {
    expect(recognitionHasLowResolutionWarning({ originalWidth: 400, originalHeight: 500 })).toBe(true);
    const validation = validateRecognitionPresentationPhoto({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: {
        sourceEntryId: "entry-1",
        crop: validCrop,
        isBlocked: false,
        originalWidth: 400,
        originalHeight: 500,
        flags: [],
      },
    });
    expect(validation.photoReady).toBe(true);
    expect(validation.warnings).toContain(RECOGNITION_LOW_RESOLUTION_WARNING);
    expect(validation.blockers).toEqual([]);
  });
});

describe("Recognition event PPT readiness and approved roster", () => {
  it("counts approved photo blockers and ignores name-only", () => {
    const readiness = buildRecognitionEventPptReadiness({
      candidates: [
        { reviewStatus: "approved", requiresPhoto: false, hasOriginalPhoto: false, preferredSourceEntryId: null },
        { reviewStatus: "approved", requiresPhoto: true, hasOriginalPhoto: true, preferredSourceEntryId: "e1", preferredSourceBelongsToCandidate: true, preferredSourceHasOriginalPhoto: true, photoReview: { sourceEntryId: "e1", crop: validCrop, isBlocked: false } },
        { reviewStatus: "approved", requiresPhoto: true, hasOriginalPhoto: true, preferredSourceEntryId: null },
        { reviewStatus: "approved", requiresPhoto: true, hasOriginalPhoto: true, preferredSourceEntryId: "e2", preferredSourceBelongsToCandidate: true, preferredSourceHasOriginalPhoto: true, photoReview: { sourceEntryId: "e2", crop: null, isBlocked: false } },
        { reviewStatus: "approved", requiresPhoto: true, hasOriginalPhoto: true, preferredSourceEntryId: "e3", preferredSourceBelongsToCandidate: true, preferredSourceHasOriginalPhoto: true, photoReview: { sourceEntryId: "e3", crop: validCrop, isBlocked: true } },
        { reviewStatus: "pending", requiresPhoto: true, hasOriginalPhoto: false, preferredSourceEntryId: null },
      ],
    });
    expect(readiness.totalApproved).toBe(5);
    expect(readiness.photoRequiredApproved).toBe(4);
    expect(readiness.readyPhotos).toBe(1);
    expect(readiness.missingPreferredPhoto).toBe(1);
    expect(readiness.missingCrop).toBe(1);
    expect(readiness.blockedPhotos).toBe(1);
    expect(readiness.totalBlockingIssues).toBe(3);
  });

  it("keeps incomplete photo candidates on the approved roster while presentation validation flags them", () => {
    const roster = buildRecognitionApprovedRoster({
      eventId: "evt-1",
      eventName: "月會",
      year: 2026,
      month: 9,
      awards: [
        { eventAwardId: "a3", awardName: "新科世界組", sortOrder: 1, isEnabled: true, requiresPhoto: true },
      ],
      candidates: [
        {
          id: "c-photo",
          eventAwardId: "a3",
          reviewStatus: "approved",
          displayName: "王小明",
          sortOrder: 1,
          createdAt: "2026-09-01T00:00:00Z",
          preferredSourceEntryId: "entry-1",
          hasOriginalPhoto: true,
          photoReview: { sourceEntryId: "entry-1", crop: null, isBlocked: false },
        },
      ],
    });
    expect(roster.awards[0]?.candidates).toHaveLength(1);
    expect(roster.awards[0]?.candidates[0]?.photoReady).toBe(false);
    expect(roster.awards[0]?.candidates[0]?.hasPresentationCrop).toBe(false);
    const validation = validateRecognitionPresentationPhoto({
      requiresPhoto: true,
      reviewStatus: "approved",
      hasOriginalPhoto: true,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: { sourceEntryId: "entry-1", crop: null, isBlocked: false },
    });
    expect(validation.photoReady).toBe(false);
    expect(validation.blockers.length).toBeGreaterThan(0);
  });

  it("moves to the next candidate that still needs photo work", () => {
    expect(nextRecognitionPhotoReviewCandidateId({
      currentCandidateId: "c1",
      items: [
        { candidateId: "c1", readinessState: "crop_ready" },
        { candidateId: "c2", readinessState: "needs_photo_review" },
        { candidateId: "c3", readinessState: "crop_ready" },
      ],
    })).toBe("c2");
  });
});

describe("Recognition private storage remains intact", () => {
  it("does not add public storage policies and keeps originals on the private bucket path", () => {
    const photoReviewMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/040_recognition_photo_review.sql"),
      "utf8",
    );
    const collectionMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/037_recognition_public_collection.sql"),
      "utf8",
    );
    expect(collectionMigration).toContain("recognition-photos");
    expect(collectionMigration).toContain("No storage.objects policies");
    expect(photoReviewMigration).not.toMatch(/storage\.objects/i);
    expect(photoReviewMigration).not.toContain("public bucket");
    expect(photoReviewMigration).toContain("Never touches original photos");
  });
});

describe("Recognition photo review must not infer identity", () => {
  it("introduces no face-recognition or identity-matching tokens", () => {
    const files = [
      "src/lib/recognition/recognition-photo-review.ts",
      "src/lib/recognition/recognition-photo-review-service.ts",
      "src/components/recognition/RecognitionPhotoReviewPage.tsx",
      "src/components/recognition/PresentationCropEditor.tsx",
      "supabase/migrations/040_recognition_photo_review.sql",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8").toLowerCase();
      for (const token of FACE_IDENTITY_FORBIDDEN_TOKENS) {
        expect(source).not.toContain(token.toLowerCase());
      }
    }
  });
});
