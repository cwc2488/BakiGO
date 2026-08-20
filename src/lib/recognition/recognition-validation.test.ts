import { describe, expect, it } from "vitest";
import { parseRecognitionPhotoRef } from "@/lib/recognition/recognition-photo-url";
import {
  aggregateRecognitionEventDashboardCounts,
  defaultCropForInspectedPhoto,
  evaluateRecognitionEntryValidation,
  isRecognitionPptReadyStatus,
  RECOGNITION_MULTI_PERSON_WARNING,
  RECOGNITION_TECHNICAL_OVERRIDE_BLOCKED,
  recognitionAuthoritativePhotoPath,
  summarizeRecognitionSubmissionCompletion,
} from "@/lib/recognition/recognition-validation";
import { buildRecognitionPresentationData } from "@/lib/recognition/recognition-presentation-dto";

const NAME_AWARD = { eventAwardId: "award-name", name: "MAP 第一個月", requiresPhoto: false };
const PHOTO_AWARD = { eventAwardId: "award-photo", name: "新科督導", requiresPhoto: true };
const JPEG_PATH = "recognition/sub-1/entries/entry-1/original.jpg";
const PORTRAIT = { ok: true as const, width: 1200, height: 1600 };
const LANDSCAPE = { ok: true as const, width: 2400, height: 1200 };
const LOW_RES = { ok: true as const, width: 400, height: 500 };

describe("Recognition self-service validation", () => {
  it("1. complete name-only award AUTO PASSes", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: NAME_AWARD,
      photoStoragePath: null,
    });
    expect(result.status).toBe("PASS");
    expect(result.pptReady).toBe(true);
    expect(result.exception).toBe(false);
  });

  it("2. requires_photo + valid image AUTO PASSes", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      crop: defaultCropForInspectedPhoto(PORTRAIT),
    });
    expect(result.status).toBe("PASS");
    expect(result.pptReady).toBe(true);
  });

  it("3. requires_photo + missing image is BLOCKED", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: null,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.hasTechnicalBlocker).toBe(true);
    expect(result.pptReady).toBe(false);
    expect(result.canAdminOverride).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing_photo")).toBe(true);
  });

  it("4. corrupted / invalid image is technical BLOCKED", () => {
    const corrupted = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: { ok: false, code: "corrupted_image" },
    });
    expect(corrupted.status).toBe("BLOCKED");
    expect(corrupted.hasTechnicalBlocker).toBe(true);
    expect(corrupted.canAdminOverride).toBe(false);

    const invalidRef = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: "not a url and not a storage path???",
      imageInspect: { ok: false, code: "unreadable_image" },
    });
    expect(invalidRef.hasTechnicalBlocker).toBe(true);
  });

  it("5. multi-person detected is WARNING, not BLOCKED; submitter must resolve", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
    });
    expect(result.status).toBe("WARNING");
    expect(result.issues.some((issue) => issue.code === "multi_person")).toBe(true);
    expect(result.issues.find((issue) => issue.code === "multi_person")?.message).toBe(
      RECOGNITION_MULTI_PERSON_WARNING,
    );
    expect(result.hasTechnicalBlocker).toBe(false);
    expect(result.exception).toBe(false);
    expect(result.canAdminOverride).toBe(false);
    expect(result.submissionComplete).toBe(false);
    expect(result.pptReady).toBe(false);
  });

  it("6. submitter confirming multi-person photo makes the row ready", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      confirmedWarnings: ["multi_person"],
    });
    expect(result.status).toBe("PASS");
    expect(result.pptReady).toBe(true);
    expect(result.submissionComplete).toBe(true);
    expect(result.issues.some((issue) => issue.code === "multi_person")).toBe(false);
  });

  it("7. recrop updates the current crop used for PPT", () => {
    const first = defaultCropForInspectedPhoto(PORTRAIT);
    const recropped = { x: 0.1, y: 0.05, width: 0.6, height: 0.8 };
    expect(recropped).not.toEqual(first);
    expect(recognitionAuthoritativePhotoPath({
      originalPhotoStoragePath: JPEG_PATH,
      currentPhotoStoragePath: JPEG_PATH,
    })).toBe(JPEG_PATH);
  });

  it("8. replaced image becomes the authoritative PPT photo", () => {
    const next = "recognition/sub-1/entries/entry-1/current.jpg";
    expect(recognitionAuthoritativePhotoPath({
      originalPhotoStoragePath: JPEG_PATH,
      currentPhotoStoragePath: next,
    })).toBe(next);
  });

  it("9. 0-entry award is omitted from PPT and does not block readiness", () => {
    const data = buildRecognitionPresentationData({
      event: { id: "evt-1", name: "2026 年 9 月月會", year: 2026, month: 9 },
      awards: [
        {
          eventAwardId: "empty-award",
          awardSlug: "map_month_1",
          awardName: "MAP 第一個月",
          sortOrder: 1,
          isEnabled: true,
          requiresPhoto: false,
        },
        {
          eventAwardId: "filled-award",
          awardSlug: "new_supervisor",
          awardName: "新科督導",
          sortOrder: 2,
          isEnabled: true,
          requiresPhoto: false,
        },
      ],
      candidates: [{
        id: "c1",
        eventAwardId: "filled-award",
        reviewStatus: "approved",
        displayName: "王小明",
        sortOrder: 1,
        createdAt: "2026-08-01T00:00:00.000Z",
        preferredSourceEntryId: null,
        hasOriginalPhoto: false,
        sources: [],
      }],
    });
    expect(data.awards.map((award) => award.eventAwardId)).toEqual(["filled-award"]);
    expect(data.awards.some((award) => award.eventAwardId === "empty-award")).toBe(false);
  });

  it("10. PASS does not require Admin review", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: NAME_AWARD,
      photoStoragePath: null,
    });
    expect(result.status).toBe("PASS");
    expect(result.exception).toBe(false);
    expect(result.canAdminOverride).toBe(false);
  });

  it("11. unresolved BLOCKED belongs in Exception Center", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "",
      award: NAME_AWARD,
      photoStoragePath: null,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.exception).toBe(true);
  });

  it("12. photo WARNING is submitter-owned; Admin Override still works as escape hatch", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
    });
    expect(result.status).toBe("WARNING");
    expect(result.canAdminOverride).toBe(false);
    expect(result.pptReady).toBe(false);

    const overridden = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      adminOverride: {
        originalStatus: "WARNING",
        originalIssues: result.issues,
        overriddenBy: "admin-1",
        overriddenAt: "2026-09-01T00:00:00.000Z",
        reason: "夫妻合照",
      },
    });
    expect(overridden.status).toBe("ADMIN_OVERRIDE");
    expect(overridden.pptReady).toBe(true);
  });

  it("13. ADMIN_OVERRIDE is PPT ready", () => {
    expect(isRecognitionPptReadyStatus("ADMIN_OVERRIDE")).toBe(true);
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LOW_RES,
      adminOverride: {
        originalStatus: "WARNING",
        originalIssues: [],
        overriddenBy: "admin-1",
        overriddenAt: "2026-09-01T00:00:00.000Z",
        reason: null,
      },
    });
    expect(result.status).toBe("ADMIN_OVERRIDE");
    expect(result.pptReady).toBe(true);
  });

  it("14. technical impossible asset cannot be unsafe-overridden", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      imageInspect: { ok: false, code: "storage_object_missing" },
      adminOverride: {
        originalStatus: "BLOCKED",
        originalIssues: [],
        overriddenBy: "admin-1",
        overriddenAt: "2026-09-01T00:00:00.000Z",
        reason: "先過",
      },
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.hasTechnicalBlocker).toBe(true);
    expect(result.canAdminOverride).toBe(false);
    expect(result.pptReady).toBe(false);
    expect(RECOGNITION_TECHNICAL_OVERRIDE_BLOCKED).toContain("無法強制通過");
  });

  it("15–16. EXCLUDED keeps audit and does not block PPT readiness", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: null,
      excluded: true,
    });
    expect(result.status).toBe("EXCLUDED");
    expect(result.pptReady).toBe(false);
    expect(result.exception).toBe(false);
    expect(result.submissionComplete).toBe(true);

    const completion = summarizeRecognitionSubmissionCompletion([
      { status: "PASS", pptReady: true, submissionComplete: true },
      { status: "EXCLUDED", pptReady: false, submissionComplete: true },
    ]);
    expect(completion.complete).toBe(true);
    expect(completion.blockedCount).toBe(0);

    const data = buildRecognitionPresentationData({
      event: { id: "evt-1", name: "月會", year: 2026, month: 9 },
      awards: [{
        eventAwardId: "award-1",
        awardSlug: "map_month_1",
        awardName: "MAP 第一個月",
        sortOrder: 1,
        isEnabled: true,
        requiresPhoto: false,
      }],
      candidates: [{
        id: "excluded-candidate",
        eventAwardId: "award-1",
        reviewStatus: "rejected",
        displayName: "王小明",
        sortOrder: 1,
        createdAt: "2026-08-01T00:00:00.000Z",
        preferredSourceEntryId: null,
        hasOriginalPhoto: false,
        sources: [],
      }],
    });
    expect(data.awards).toHaveLength(0);
  });

  it("submission complete requires submitter-owned issues resolved", () => {
    const incomplete = summarizeRecognitionSubmissionCompletion([
      { status: "PASS", pptReady: true, submissionComplete: true },
      { status: "BLOCKED", pptReady: false, submissionComplete: false },
    ]);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.blockedCount).toBe(1);

    const waitingOnSubmitter = summarizeRecognitionSubmissionCompletion([
      { status: "PASS", pptReady: true, submissionComplete: true },
      { status: "WARNING", pptReady: false, submissionComplete: false },
    ]);
    expect(waitingOnSubmitter.complete).toBe(false);

    const complete = summarizeRecognitionSubmissionCompletion([
      { status: "PASS", pptReady: true, submissionComplete: true },
      { status: "WARNING", pptReady: true, submissionComplete: true },
    ]);
    expect(complete.complete).toBe(true);
  });

  it("does not treat a storage object path as an invalid URL", () => {
    expect(parseRecognitionPhotoRef(JPEG_PATH).ok).toBe(true);
    if (parseRecognitionPhotoRef(JPEG_PATH).ok) {
      expect(parseRecognitionPhotoRef(JPEG_PATH)).toMatchObject({ kind: "storage-path" });
    }
  });

  it("dashboard counts follow live evaluation, not a stale stored BLOCKED column", () => {
    const livePass = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      crop: defaultCropForInspectedPhoto(PORTRAIT),
    });
    expect(livePass.status).toBe("PASS");
    expect(livePass.pptReady).toBe(true);

    const dashboard = aggregateRecognitionEventDashboardCounts([
      { ...livePass, eventAwardId: "award-photo" },
      { ...livePass, eventAwardId: "award-photo" },
    ]);
    expect(dashboard.pptReadyCount).toBe(2);
    expect(dashboard.passCount).toBe(2);
    expect(dashboard.blockedCount).toBe(0);
    expect(dashboard.exceptionCount).toBe(0);
    expect(dashboard.blockedCount).toBe(dashboard.exceptionCount);
    expect(dashboard.pptReady).toBe(true);
  });

  it("dashboard BLOCKED count matches exceptionCount from the same live results", () => {
    const blocked = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: null,
    });
    const warning = evaluateRecognitionEntryValidation({
      submittedName: "李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      crop: defaultCropForInspectedPhoto(LANDSCAPE),
    });
    const dashboard = aggregateRecognitionEventDashboardCounts([
      { ...blocked, eventAwardId: "award-photo" },
      { ...warning, eventAwardId: "award-photo" },
    ]);
    expect(warning.status).toBe("WARNING");
    expect(warning.pptReady).toBe(false);
    expect(dashboard.blockedCount).toBe(1);
    expect(dashboard.exceptionCount).toBe(1);
    expect(dashboard.warningCount).toBe(1);
    expect(dashboard.pptReadyCount).toBe(0);
    expect(dashboard.pptReady).toBe(false);
  });
});

describe("Recognition event dashboard source contract", () => {
  it("derives dashboard counts from live evaluation, not stored validation_status", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/recognition/recognition-validation-service.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function getRecognitionEventDashboard");
    const end = source.indexOf("export async function listRecognitionExceptions");
    const body = source.slice(start, end);
    expect(body).toContain("aggregateRecognitionEventDashboardCounts");
    expect(body).not.toContain("entry.validation_status ?? \"BLOCKED\"");
  });
});
