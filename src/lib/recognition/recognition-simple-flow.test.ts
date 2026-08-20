import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateRecognitionEntryValidation,
  summarizeRecognitionSubmissionCompletion,
  RECOGNITION_NO_PERSON_MESSAGE,
  RECOGNITION_UNCERTAIN_PERSON_MESSAGE,
} from "@/lib/recognition/recognition-validation";
import { personDetectionFromStoredIssueCodes } from "@/lib/recognition/recognition-person-detect";
import type { RecognitionPersonDetection } from "@/lib/recognition/recognition-person-detect";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PHOTO_AWARD = { eventAwardId: "award-1", name: "新科督導", requiresPhoto: true };
const JPEG_PATH = "recognition/sub-1/entries/entry-1/original.jpg";
const LANDSCAPE = { ok: true as const, width: 2400, height: 1200 };
const LOW_RES = { ok: true as const, width: 400, height: 500 };
const PORTRAIT = { ok: true as const, width: 1200, height: 1600 };

const SINGLE: RecognitionPersonDetection = {
  personCount: 1,
  personCountCategory: "single",
  confidence: 0.95,
};
const NONE: RecognitionPersonDetection = {
  personCount: 0,
  personCountCategory: "none",
  confidence: 0.9,
};
const MULTI: RecognitionPersonDetection = {
  personCount: 2,
  personCountCategory: "multiple",
  confidence: 0.9,
};
const UNCERTAIN: RecognitionPersonDetection = {
  personCount: 0,
  personCountCategory: "uncertain",
  confidence: 0,
};

describe("recognition simple submission + ppt flow", () => {
  it("1. submit validation result separates complete vs needs-fix", () => {
    const ready = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: SINGLE,
    });
    expect(ready.submissionComplete).toBe(true);
    expect(ready.pptReady).toBe(true);

    const needsFix = evaluateRecognitionEntryValidation({
      submittedName: "陳小美",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: MULTI,
    });
    expect(needsFix.submissionComplete).toBe(false);
    expect(needsFix.pptReady).toBe(false);

    const completion = summarizeRecognitionSubmissionCompletion([ready, needsFix]);
    expect(completion.complete).toBe(false);
    expect(completion.blockedCount).toBe(1);
    expect(completion.readyCount).toBe(1);
  });

  it("2–4. multi-person confirm is submitter-owned and does not create manager photo work", () => {
    const service = src("src/lib/recognition/recognition-validation-service.ts");
    expect(service).toContain("Submitter-confirmed multi-person must not create manager photo-review work");
    expect(service).toContain("p_flags: []");
    expect(service).not.toMatch(/group_photo/);
    expect(service).toContain("onlySubmitterPhotoGates");

    const confirmed = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: MULTI,
      confirmedWarnings: ["multi_person"],
    });
    expect(confirmed.pptReady).toBe(true);
    expect(confirmed.exception).toBe(false);
    expect(confirmed.canAdminOverride).toBe(false);
  });

  it("5–7. PASS / confirmed WARNING / ADMIN_OVERRIDE are PPT eligible; manager override remains", () => {
    expect(evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: SINGLE,
    }).pptReady).toBe(true);

    expect(evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LOW_RES,
      personDetection: SINGLE,
      confirmedWarnings: ["low_resolution"],
    }).pptReady).toBe(false);

    expect(evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LOW_RES,
      personDetection: SINGLE,
      confirmedWarnings: ["low_resolution"],
    }).submissionComplete).toBe(false);

    const businessBlocked = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: SINGLE,
      crop: { x: -1, y: 0, width: 0.5, height: 0.5 },
    });
    expect(businessBlocked.status).toBe("BLOCKED");
    expect(businessBlocked.canAdminOverride).toBe(true);

    const overridden = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: SINGLE,
      crop: { x: -1, y: 0, width: 0.5, height: 0.5 },
      adminOverride: {
        originalStatus: "BLOCKED",
        originalIssues: businessBlocked.issues,
        overriddenBy: "admin-1",
        overriddenAt: "2026-09-01T00:00:00.000Z",
        reason: "確認無誤",
      },
    });
    expect(overridden.status).toBe("ADMIN_OVERRIDE");
    expect(overridden.pptReady).toBe(true);
  });

  it("8–9. public page exits to success after complete; resume entry restored", () => {
    const page = src("src/components/recognition/RecognitionPublicCollectionPage.tsx");
    expect(page).toContain('setView("success")');
    expect(page).toContain("檢查並送出");
    expect(page).toContain("重新檢查並送出");
    expect(page).not.toContain("回到投稿表單");
    expect(page).not.toContain("確認這張夠清楚");
    expect(page).not.toContain("keepLowResolution");
    expect(page).toContain("確認照片沒問題");
    expect(page).toContain("你已經完成投稿");
    expect(page).toContain("截止前仍可以修改內容");
    expect(page).toContain("✏️ 修改上一篇投稿");
    expect(page).toContain("already_submitted");
    expect(page).toContain("beginEditExisting");
    // User-facing copy must not expose implementation details.
    expect(page).not.toContain("顯示 editToken");
    expect(page).not.toContain("localStorage key");

    const eventPage = src("src/components/recognition/RecognitionEventPage.tsx");
    expect(eventPage).toContain("可產 PPT");
    expect(eventPage).toContain("需要我決定");
    expect(eventPage).toContain("系統狀態（除錯）");

    const exceptions = src("src/components/recognition/RecognitionExceptionCenterPage.tsx");
    expect(exceptions).toContain("需要我決定");
    expect(exceptions).toContain("確認無誤・強制通過");
    expect(exceptions).toContain("severity === \"blocked\"");

    const service = src("src/lib/recognition/recognition-validation-service.ts");
    expect(service).toContain("One candidate sync for the whole submission");
    expect(service).toContain("skipAutoPass: true");
  });

  it("photo person gates: 0 / uncertain / multi / low-res hard rules", () => {
    const zero = evaluateRecognitionEntryValidation({
      submittedName: "張少軒",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: NONE,
      confirmedWarnings: ["no_person", "multi_person"],
    });
    expect(zero.issues.some((issue) => issue.code === "no_person")).toBe(true);
    expect(zero.issues.find((issue) => issue.code === "no_person")?.message).toBe(RECOGNITION_NO_PERSON_MESSAGE);
    expect(zero.submissionComplete).toBe(false);
    expect(zero.pptReady).toBe(false);
    expect(zero.exception).toBe(false);

    const uncertain = evaluateRecognitionEntryValidation({
      submittedName: "張少軒",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: UNCERTAIN,
      confirmedWarnings: ["uncertain_person"],
    });
    expect(uncertain.issues.some((issue) => issue.code === "uncertain_person")).toBe(true);
    expect(uncertain.issues.find((issue) => issue.code === "uncertain_person")?.message)
      .toBe(RECOGNITION_UNCERTAIN_PERSON_MESSAGE);
    expect(uncertain.pptReady).toBe(false);

    const multi = evaluateRecognitionEntryValidation({
      submittedName: "夫妻檔",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      personDetection: MULTI,
    });
    expect(multi.issues.some((issue) => issue.code === "multi_person")).toBe(true);
    expect(multi.pptReady).toBe(false);

    const multiConfirmed = evaluateRecognitionEntryValidation({
      submittedName: "夫妻檔",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      personDetection: MULTI,
      confirmedWarnings: ["multi_person"],
    });
    expect(multiConfirmed.pptReady).toBe(true);

    // Landscape alone must not fake multi_person without vision.
    const landscapeOnly = evaluateRecognitionEntryValidation({
      submittedName: "風景",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
      personDetection: SINGLE,
    });
    expect(landscapeOnly.issues.some((issue) => issue.code === "multi_person")).toBe(false);
    expect(landscapeOnly.pptReady).toBe(true);

    expect(personDetectionFromStoredIssueCodes(["no_person"])?.personCountCategory).toBe("none");
    expect(personDetectionFromStoredIssueCodes(["multi_person"])?.personCountCategory).toBe("multiple");
  });

  it("vision module is Recognition-scoped and fail-closed", () => {
    const detect = src("src/lib/recognition/recognition-person-detect.ts");
    expect(detect).toContain("gpt-4o-mini-2024-07-18");
    expect(detect).toContain('detail: RECOGNITION_PERSON_DETECT_IMAGE_DETAIL');
    expect(detect).toContain("uncertain");
    expect(detect).not.toContain("coaching");
    expect(detect).not.toContain("quiz");

    const post = src("src/app/api/recognition/public/[token]/submissions/route.ts");
    expect(post).toContain("detectRecognitionPhotoPersons");
    expect(post).toContain("personDetectionByEntryId");

    const patch = src("src/app/api/recognition/public/[token]/submissions/current/route.ts");
    expect(patch).toContain("detectRecognitionPhotoPersons");
    expect(patch).toContain("createSignedUrl");
  });
});
