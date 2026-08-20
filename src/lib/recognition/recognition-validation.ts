/**
 * Recognition Center self-service validation engine.
 *
 * UI must not invent KPI-style progress. This module is the source of
 * PASS / WARNING / BLOCKED / ADMIN_OVERRIDE / EXCLUDED for one entry.
 *
 * Multi-person detection is a conservative landscape heuristic only.
 * Face identity / picking an honoree is forbidden.
 */

import { parseRecognitionPhotoRef } from "@/lib/recognition/recognition-photo-url";
import {
  defaultRecognitionCoverCrop,
  recognitionHasLandscapeOrientationHint,
  recognitionHasLowResolutionWarning,
  validateRecognitionNormalizedCrop,
} from "@/lib/recognition/recognition-photo-review";
import { RECOGNITION_PUBLIC_ALLOWED_MIME_TYPES } from "@/lib/recognition/recognition-domain";
import type {
  RecognitionAdminOverrideAudit,
  RecognitionEntryValidationResult,
  RecognitionNormalizedCrop,
  RecognitionSubmissionCompletion,
  RecognitionValidationIssue,
  RecognitionValidationIssueCode,
  RecognitionValidationStatus,
} from "@/types/recognition";

export const RECOGNITION_MULTI_PERSON_WARNING =
  "照片中可能有多位人物。如果照片中的人物都是本次一起受表揚者，可以繼續使用。如果不是，請重新上傳適合的照片。";

export const RECOGNITION_TECHNICAL_OVERRIDE_BLOCKED =
  "此筆有技術問題，無法強制通過。請修正照片，或取消此筆表揚。";

const ISSUE = {
  missingName: (): RecognitionValidationIssue => ({
    code: "missing_name",
    severity: "blocked",
    message: "請填寫受表揚者姓名。",
    overridable: false,
  }),
  invalidAward: (): RecognitionValidationIssue => ({
    code: "invalid_award",
    severity: "blocked",
    message: "表揚項目無效或已停用。",
    overridable: false,
  }),
  missingPhoto: (awardName: string): RecognitionValidationIssue => ({
    code: "missing_photo",
    severity: "technical",
    message: `「${awardName}」需要可讀取的照片。`,
    overridable: false,
  }),
  invalidPhotoRef: (): RecognitionValidationIssue => ({
    code: "invalid_photo_ref",
    severity: "technical",
    message: "缺少有效照片。",
    overridable: false,
  }),
  unsupportedFormat: (): RecognitionValidationIssue => ({
    code: "unsupported_image_format",
    severity: "technical",
    message: "圖片格式無法供簡報使用。",
    overridable: false,
  }),
  corrupted: (): RecognitionValidationIssue => ({
    code: "corrupted_image",
    severity: "technical",
    message: "圖片損壞，無法讀取。",
    overridable: false,
  }),
  unreadable: (): RecognitionValidationIssue => ({
    code: "unreadable_image",
    severity: "technical",
    message: "簡報系統無法讀取這張圖片。",
    overridable: false,
  }),
  storageMissing: (): RecognitionValidationIssue => ({
    code: "storage_object_missing",
    severity: "technical",
    message: "照片檔案不存在，無法產生簡報。",
    overridable: false,
  }),
  multiPerson: (): RecognitionValidationIssue => ({
    code: "multi_person",
    severity: "warning",
    message: "照片中可能有多位人物。如果照片中的人物都是本次一起受表揚者，可以繼續使用。如果不是，請重新上傳適合的照片。",
    overridable: true,
  }),
  lowResolution: (): RecognitionValidationIssue => ({
    code: "low_resolution",
    severity: "warning",
    message: "這張照片製作成表揚簡報後可能會模糊，請換一張較清楚的照片。",
    overridable: true,
  }),
  duplicateName: (): RecognitionValidationIssue => ({
    code: "duplicate_name",
    severity: "warning",
    message: "同一表揚項目似乎已有相同姓名。仍可投稿，系統不會自動合併。",
    overridable: true,
  }),
} as const;

export type RecognitionImageInspectResult =
  | {
      ok: true;
      width: number;
      height: number;
      mimeType?: string | null;
    }
  | {
      ok: false;
      code: Extract<
        RecognitionValidationIssueCode,
        "corrupted_image" | "unreadable_image" | "unsupported_image_format" | "storage_object_missing"
      >;
    };

export type RecognitionEntryValidationInput = {
  submittedName: string;
  award: { eventAwardId: string; name: string; requiresPhoto: boolean } | null;
  photoStoragePath: string | null;
  photoMimeType?: string | null;
  imageInspect?: RecognitionImageInspectResult | null;
  crop?: RecognitionNormalizedCrop | null;
  confirmedWarnings?: readonly string[];
  duplicateName?: boolean;
  excluded?: boolean;
  adminOverride?: RecognitionAdminOverrideAudit | null;
};

function hasIssue(
  issues: RecognitionValidationIssue[],
  code: RecognitionValidationIssueCode,
): boolean {
  return issues.some((issue) => issue.code === code);
}

function technicalIssueForInspect(
  code: "corrupted_image" | "unreadable_image" | "unsupported_image_format" | "storage_object_missing",
): RecognitionValidationIssue {
  if (code === "corrupted_image") return ISSUE.corrupted();
  if (code === "unsupported_image_format") return ISSUE.unsupportedFormat();
  if (code === "storage_object_missing") return ISSUE.storageMissing();
  return ISSUE.unreadable();
}

export function recognitionAuthoritativePhotoPath(input: {
  currentPhotoStoragePath?: string | null;
  originalPhotoStoragePath?: string | null;
}): string | null {
  const current = input.currentPhotoStoragePath?.trim() || null;
  if (current) return current;
  const original = input.originalPhotoStoragePath?.trim() || null;
  return original;
}

export function isRecognitionValidationStatus(value: string): value is RecognitionValidationStatus {
  return value === "PASS"
    || value === "WARNING"
    || value === "BLOCKED"
    || value === "ADMIN_OVERRIDE"
    || value === "EXCLUDED";
}

export function isRecognitionPptReadyStatus(status: RecognitionValidationStatus): boolean {
  return status === "PASS" || status === "ADMIN_OVERRIDE" || status === "WARNING";
}

export function collectRecognitionEntryIssues(
  input: RecognitionEntryValidationInput,
): RecognitionValidationIssue[] {
  const issues: RecognitionValidationIssue[] = [];
  const name = input.submittedName.trim();
  if (!name) issues.push(ISSUE.missingName());
  if (!input.award) issues.push(ISSUE.invalidAward());

  const requiresPhoto = Boolean(input.award?.requiresPhoto);
  const photoPath = input.photoStoragePath?.trim() || null;

  if (requiresPhoto) {
    if (!photoPath) {
      issues.push(ISSUE.missingPhoto(input.award?.name ?? "此項目"));
    } else {
      const parsed = parseRecognitionPhotoRef(photoPath);
      if (!parsed.ok || parsed.kind === "blob-url") {
        issues.push(ISSUE.invalidPhotoRef());
      }
      if (input.photoMimeType && !RECOGNITION_PUBLIC_ALLOWED_MIME_TYPES.has(input.photoMimeType)) {
        issues.push(ISSUE.unsupportedFormat());
      }
      if (input.imageInspect && !input.imageInspect.ok) {
        issues.push(technicalIssueForInspect(input.imageInspect.code));
      }
    }
  } else if (photoPath) {
    const parsed = parseRecognitionPhotoRef(photoPath);
    if (!parsed.ok && photoPath.length > 0) {
      issues.push(ISSUE.invalidPhotoRef());
    }
  }

  const inspect = input.imageInspect && input.imageInspect.ok ? input.imageInspect : null;
  const confirmed = new Set(input.confirmedWarnings ?? []);

  if (requiresPhoto && inspect) {
    if (recognitionHasLandscapeOrientationHint({
      originalWidth: inspect.width,
      originalHeight: inspect.height,
    }) && !confirmed.has("multi_person")) {
      issues.push(ISSUE.multiPerson());
    }
    if (
      recognitionHasLowResolutionWarning({
        originalWidth: inspect.width,
        originalHeight: inspect.height,
      })
      && !confirmed.has("low_resolution")
    ) {
      issues.push(ISSUE.lowResolution());
    }
  }

  if (input.duplicateName && name) {
    issues.push(ISSUE.duplicateName());
  }

  if (input.crop && validateRecognitionNormalizedCrop(input.crop) !== null) {
    // Invalid crop is a submitter-fixable blocked issue, not a missing binary.
    issues.push({
      code: "unreadable_image",
      severity: "blocked",
      message: "裁切範圍無效，請重新裁切。",
      overridable: true,
    });
  }

  return issues;
}

export function evaluateRecognitionEntryValidation(
  input: RecognitionEntryValidationInput,
): RecognitionEntryValidationResult {
  if (input.excluded) {
    return {
      status: "EXCLUDED",
      issues: [],
      pptReady: false,
      submissionComplete: true,
      hasTechnicalBlocker: false,
      canAdminOverride: false,
      exception: false,
    };
  }

  const issues = collectRecognitionEntryIssues(input);
  const hasTechnicalBlocker = issues.some((issue) => issue.severity === "technical");
  const hasBlocked = issues.some((issue) => issue.severity === "blocked" || issue.severity === "technical");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  const submitterMustResolve = issues.some(
    (issue) => issue.code === "multi_person" || issue.code === "low_resolution",
  );
  // Photo quality / multi-person are submitter-owned. Manager override is for true BLOCKED business exceptions.
  const canAdminOverride = hasBlocked
    && !hasTechnicalBlocker
    && issues.every((issue) => issue.overridable || issue.severity === "warning");

  if (input.adminOverride && !hasTechnicalBlocker) {
    return {
      status: "ADMIN_OVERRIDE",
      issues,
      pptReady: true,
      submissionComplete: true,
      hasTechnicalBlocker: false,
      canAdminOverride: false,
      exception: false,
    };
  }

  let status: RecognitionValidationStatus;
  if (hasBlocked) status = "BLOCKED";
  else if (hasWarning) status = "WARNING";
  else status = "PASS";

  const pptReady = !hasTechnicalBlocker && !hasBlocked && !submitterMustResolve;

  return {
    status,
    issues,
    pptReady,
    submissionComplete: status !== "BLOCKED" && !submitterMustResolve,
    hasTechnicalBlocker,
    canAdminOverride: status === "BLOCKED" && canAdminOverride,
    exception: status === "BLOCKED",
  };
}

export type RecognitionEventDashboardCountInput = Pick<
  RecognitionEntryValidationResult,
  "status" | "pptReady" | "exception"
> & {
  eventAwardId: string;
};

/**
 * Single source of truth for Recognition event dashboard numbers.
 * Counts come from live evaluation results, never from a stale stored column.
 */
export function aggregateRecognitionEventDashboardCounts(
  results: RecognitionEventDashboardCountInput[],
) {
  const counts: Record<RecognitionValidationStatus, number> = {
    PASS: 0,
    WARNING: 0,
    BLOCKED: 0,
    ADMIN_OVERRIDE: 0,
    EXCLUDED: 0,
  };
  const readyAwards = new Set<string>();
  let pptReadyCount = 0;
  let exceptionCount = 0;

  for (const result of results) {
    counts[result.status] += 1;
    if (result.exception) exceptionCount += 1;
    if (result.pptReady) {
      pptReadyCount += 1;
      readyAwards.add(result.eventAwardId);
    }
  }

  return {
    passCount: counts.PASS,
    warningCount: counts.WARNING,
    blockedCount: counts.BLOCKED,
    adminOverrideCount: counts.ADMIN_OVERRIDE,
    excludedCount: counts.EXCLUDED,
    pptReadyCount,
    exceptionCount,
    effectiveAwardCount: readyAwards.size,
    pptReady: exceptionCount === 0,
  };
}

export function summarizeRecognitionSubmissionCompletion(
  entries: Array<Pick<RecognitionEntryValidationResult, "status" | "pptReady" | "submissionComplete">>,
): RecognitionSubmissionCompletion {
  const total = entries.length;
  let readyCount = 0;
  let blockedCount = 0;
  let warningCount = 0;
  let excludedCount = 0;
  for (const entry of entries) {
    if (entry.status === "EXCLUDED") {
      excludedCount += 1;
      continue;
    }
    if (!entry.submissionComplete) blockedCount += 1;
    if (entry.status === "WARNING") warningCount += 1;
    if (entry.pptReady) readyCount += 1;
  }
  return {
    complete: blockedCount === 0 && total - excludedCount > 0,
    total,
    readyCount,
    blockedCount,
    warningCount,
    excludedCount,
  };
}

export function defaultCropForInspectedPhoto(input: {
  width: number;
  height: number;
}): RecognitionNormalizedCrop {
  return defaultRecognitionCoverCrop({
    originalWidth: input.width,
    originalHeight: input.height,
  });
}

export function isMultiPersonWarningConfirmed(confirmedWarnings: readonly string[] | null | undefined): boolean {
  return (confirmedWarnings ?? []).includes("multi_person");
}
