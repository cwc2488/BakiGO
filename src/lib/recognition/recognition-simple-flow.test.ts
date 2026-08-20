import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateRecognitionEntryValidation,
  summarizeRecognitionSubmissionCompletion,
} from "@/lib/recognition/recognition-validation";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PHOTO_AWARD = { eventAwardId: "award-1", name: "新科督導", requiresPhoto: true };
const JPEG_PATH = "recognition/sub-1/entries/entry-1/original.jpg";
const LANDSCAPE = { ok: true as const, width: 2400, height: 1200 };
const LOW_RES = { ok: true as const, width: 400, height: 500 };
const PORTRAIT = { ok: true as const, width: 1200, height: 1600 };

describe("recognition simple submission + ppt flow", () => {
  it("1. submit validation result separates complete vs needs-fix", () => {
    const ready = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
    });
    expect(ready.submissionComplete).toBe(true);
    expect(ready.pptReady).toBe(true);

    const needsFix = evaluateRecognitionEntryValidation({
      submittedName: "陳小美",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
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

    const confirmed = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LANDSCAPE,
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
    }).pptReady).toBe(true);

    expect(evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LOW_RES,
      confirmedWarnings: ["low_resolution"],
    }).pptReady).toBe(false);

    expect(evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: LOW_RES,
      confirmedWarnings: ["low_resolution"],
    }).submissionComplete).toBe(false);

    const businessBlocked = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
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

  it("8–9. public page exits to success after complete; no return-to-form CTA", () => {
    const page = src("src/components/recognition/RecognitionPublicCollectionPage.tsx");
    expect(page).toContain('setView("success")');
    expect(page).toContain("檢查並送出");
    expect(page).toContain("重新檢查並送出");
    expect(page).not.toContain("回到投稿表單");
    expect(page).not.toContain("確認這張夠清楚");
    expect(page).not.toContain("keepLowResolution");
    expect(page).toContain("確認照片沒問題");

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
});
