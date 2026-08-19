import { parseRecognitionPhotoRef } from "@/lib/recognition/recognition-photo-url";
import { compareRecognitionCandidateOrder } from "@/lib/recognition/recognition-candidates";
import {
  cropMatchesPreferredSource,
  isRecognitionPresentationPhotoReady,
} from "@/lib/recognition/recognition-photo-review";
import {
  resolveRecognitionPresentationTheme,
} from "@/lib/recognition/recognition-presentation-theme";
import type {
  RecognitionPresentationAwardSection,
  RecognitionPresentationCandidate,
  RecognitionPresentationData,
  RecognitionPresentationPhoto,
} from "@/lib/recognition/recognition-presentation-types";
import type {
  RecognitionNormalizedCrop,
  RecognitionPhotoReview,
  RecognitionPhotoReviewFlag,
  RecognitionReviewStatus,
} from "@/types/recognition";

export type RecognitionPresentationDtoAwardInput = {
  eventAwardId: string;
  awardSlug: string;
  awardName: string;
  sortOrder: number;
  isEnabled: boolean;
  requiresPhoto: boolean;
};

export type RecognitionPresentationDtoCandidateInput = {
  id: string;
  eventAwardId: string;
  reviewStatus: RecognitionReviewStatus;
  displayName: string;
  sortOrder: number;
  createdAt: string;
  preferredSourceEntryId: string | null;
  hasOriginalPhoto: boolean;
  sources: Array<{
    submissionEntryId: string;
    originalPhotoStoragePath: string | null;
    originalPhotoMimeType: string | null;
    hasOriginalPhoto: boolean;
  }>;
};

export type RecognitionPresentationDtoReviewInput = {
  sourceEntryId: string | null;
  crop: RecognitionNormalizedCrop | null;
  isBlocked: boolean;
  blockedReason?: string | null;
  flags?: RecognitionPhotoReviewFlag[];
  originalWidth?: number | null;
  originalHeight?: number | null;
};

function presentationPhotoForCandidate(input: {
  requiresPhoto: boolean;
  candidate: RecognitionPresentationDtoCandidateInput;
  review: RecognitionPresentationDtoReviewInput | null | undefined;
}): RecognitionPresentationPhoto | null {
  if (!input.requiresPhoto) return null;
  const preferredSourceEntryId = input.candidate.preferredSourceEntryId;
  if (!preferredSourceEntryId || !input.review?.crop) return null;
  if (!cropMatchesPreferredSource({
    crop: input.review.crop,
    cropSourceEntryId: input.review.sourceEntryId,
    preferredSourceEntryId,
  })) {
    return null;
  }
  const source = input.candidate.sources.find((item) => item.submissionEntryId === preferredSourceEntryId);
  const parsed = parseRecognitionPhotoRef(source?.originalPhotoStoragePath);
  if (!parsed.ok || parsed.kind === "blob-url") return null;
  const storagePath = parsed.kind === "storage-path" ? parsed.storagePath : source?.originalPhotoStoragePath;
  if (!storagePath) return null;
  return {
    sourceEntryId: preferredSourceEntryId,
    storagePath,
    mimeType: source?.originalPhotoMimeType || "application/octet-stream",
    originalWidth: input.review.originalWidth ?? null,
    originalHeight: input.review.originalHeight ?? null,
    crop: input.review.crop,
  };
}

function toPresentationCandidate(input: {
  requiresPhoto: boolean;
  candidate: RecognitionPresentationDtoCandidateInput;
  review: RecognitionPresentationDtoReviewInput | null | undefined;
}): RecognitionPresentationCandidate {
  return {
    candidateId: input.candidate.id,
    displayName: input.candidate.displayName,
    candidateOrder: input.candidate.sortOrder,
    createdAt: input.candidate.createdAt,
    requiresPhoto: input.requiresPhoto,
    photo: presentationPhotoForCandidate(input),
  };
}

export function reviewToPresentationInput(
  review: RecognitionPhotoReview | null | undefined,
): RecognitionPresentationDtoReviewInput | null {
  if (!review) return null;
  return {
    sourceEntryId: review.sourceEntryId,
    crop: review.crop,
    isBlocked: review.isBlocked,
    blockedReason: review.blockedReason,
    flags: review.flags,
    originalWidth: review.originalWidth,
    originalHeight: review.originalHeight,
  };
}

/**
 * Snapshot builder. Only approved candidates on enabled awards with at least
 * one approved recipient enter the DTO. Disabled and zero-recipient awards
 * are omitted completely. Event award sort_order is the section order.
 */
export function buildRecognitionPresentationData(input: {
  event: {
    id: string;
    name: string;
    year: number;
    month: number;
    pptThemeId?: string | null;
  };
  awards: RecognitionPresentationDtoAwardInput[];
  candidates: RecognitionPresentationDtoCandidateInput[];
  reviews?: Map<string, RecognitionPhotoReview | RecognitionPresentationDtoReviewInput | null>;
}): RecognitionPresentationData {
  const theme = resolveRecognitionPresentationTheme(input.event.pptThemeId);
  const awards: RecognitionPresentationAwardSection[] = [...input.awards]
    .filter((award) => award.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((award) => {
      const candidates = input.candidates
        .filter((candidate) => (
          candidate.eventAwardId === award.eventAwardId
          && candidate.reviewStatus === "approved"
        ))
        .sort(compareRecognitionCandidateOrder)
        .map((candidate) => {
          const rawReview = input.reviews?.get(candidate.id) ?? null;
          const review = rawReview && "candidateId" in (rawReview as object)
            ? reviewToPresentationInput(rawReview as RecognitionPhotoReview)
            : (rawReview as RecognitionPresentationDtoReviewInput | null);
          return toPresentationCandidate({
            requiresPhoto: award.requiresPhoto,
            candidate,
            review,
          });
        });
      return {
        eventAwardId: award.eventAwardId,
        awardSlug: award.awardSlug,
        awardName: award.awardName,
        sortOrder: award.sortOrder,
        requiresPhoto: award.requiresPhoto,
        candidates,
      };
    })
    .filter((award) => award.candidates.length > 0);

  return {
    event: {
      id: input.event.id,
      name: input.event.name,
      year: input.event.year,
      month: input.event.month,
    },
    themeId: theme.id,
    themeVersion: theme.version,
    awards,
  };
}

export function presentationCandidateIsPhotoReady(candidate: RecognitionPresentationCandidate): boolean {
  return isRecognitionPresentationPhotoReady({
    requiresPhoto: candidate.requiresPhoto,
    reviewStatus: "approved",
    hasOriginalPhoto: Boolean(candidate.photo?.storagePath),
    originalPhotoStoragePath: candidate.photo?.storagePath ?? null,
    preferredSourceEntryId: candidate.photo?.sourceEntryId ?? null,
    preferredSourceBelongsToCandidate: Boolean(candidate.photo),
    preferredSourceHasOriginalPhoto: Boolean(candidate.photo?.storagePath),
    photoReview: candidate.photo
      ? {
          sourceEntryId: candidate.photo.sourceEntryId,
          crop: candidate.photo.crop,
          isBlocked: false,
          originalWidth: candidate.photo.originalWidth,
          originalHeight: candidate.photo.originalHeight,
        }
      : null,
  });
}
