import {
  recognitionPresentationPhotoReadinessState,
  RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS,
  type RecognitionPresentationPhotoInput,
} from "@/lib/recognition/recognition-photo-review";
import type { RecognitionPresentationPhotoBlocker } from "@/lib/recognition/recognition-presentation-types";
import type { RecognitionReviewStatus } from "@/types/recognition";

export const RECOGNITION_PRESENTATION_BLOCKER_LABELS = {
  noOriginalPhoto: "尚未提供原始照片",
  preferredNotSelected: "尚未選擇正式照片",
  noCrop: "尚未裁切",
  cropSourceMismatch: "裁切對應的照片已變更，請重新裁切",
  invalidCrop: "裁切範圍無效",
  photoBlocked: "照片已標記為不可使用",
} as const;

export function recognitionPresentationBlockerReason(
  input: RecognitionPresentationPhotoInput,
): string | null {
  if (!input.requiresPhoto) return null;
  const state = recognitionPresentationPhotoReadinessState(input);
  switch (state) {
    case "not_required":
    case "crop_ready":
      return null;
    case "no_original_photo":
      return RECOGNITION_PRESENTATION_BLOCKER_LABELS.noOriginalPhoto;
    case "preferred_source_not_selected":
      return RECOGNITION_PRESENTATION_BLOCKER_LABELS.preferredNotSelected;
    case "photo_blocked":
      return input.photoReview?.blockedReason?.trim()
        || RECOGNITION_PRESENTATION_BLOCKER_LABELS.photoBlocked;
    case "needs_photo_review": {
      if (
        input.photoReview?.crop
        && input.photoReview.sourceEntryId
        && input.preferredSourceEntryId
        && input.photoReview.sourceEntryId !== input.preferredSourceEntryId
      ) {
        return RECOGNITION_PRESENTATION_BLOCKER_LABELS.cropSourceMismatch;
      }
      if (input.photoReview?.crop) {
        return RECOGNITION_PRESENTATION_BLOCKER_LABELS.invalidCrop;
      }
      return RECOGNITION_PRESENTATION_BLOCKER_LABELS.noCrop;
    }
    default:
      return RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.noCrop;
  }
}

export function listRecognitionPresentationPhotoBlockers(input: {
  candidates: Array<{
    id: string;
    displayName: string;
    reviewStatus: RecognitionReviewStatus;
    requiresPhoto: boolean;
    hasOriginalPhoto: boolean;
    preferredSourceEntryId: string | null;
    preferredSourceBelongsToCandidate?: boolean;
    preferredSourceHasOriginalPhoto?: boolean;
    photoReview?: RecognitionPresentationPhotoInput["photoReview"];
  }>;
}): RecognitionPresentationPhotoBlocker[] {
  const blockers: RecognitionPresentationPhotoBlocker[] = [];
  for (const candidate of input.candidates) {
    if (candidate.reviewStatus !== "approved") continue;
    const reason = recognitionPresentationBlockerReason(candidate);
    if (!reason) continue;
    blockers.push({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      reason,
    });
  }
  return blockers;
}

export function formatRecognitionPresentationNotReadyError(
  blockers: RecognitionPresentationPhotoBlocker[],
): string {
  const header = `無法產生簡報，尚有 ${blockers.length} 個照片問題需要處理：`;
  const lines = blockers.map((blocker) => `- ${blocker.displayName}：${blocker.reason}`);
  return [header, ...lines].join("\n");
}
