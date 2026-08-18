import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  getRecognitionCandidate,
  loadRecognitionCandidatesForEvent,
} from "@/lib/recognition/recognition-candidate-service";
import {
  buildRecognitionEventPptReadiness,
  matchesRecognitionPhotoReviewQueueFilter,
  parseRecognitionNormalizedCrop,
  RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR,
  RECOGNITION_PRESENTATION_CROP_ASPECT,
  validateRecognitionNormalizedCrop,
  validateRecognitionPhotoReviewFlags,
  validateRecognitionPresentationPhoto,
} from "@/lib/recognition/recognition-photo-review";
import { RecognitionServiceError } from "@/lib/recognition/recognition-service";
import type {
  RecognitionEventPptReadiness,
  RecognitionNormalizedCrop,
  RecognitionPhotoReview,
  RecognitionPhotoReviewFlag,
  RecognitionPhotoReviewQueueFilter,
  RecognitionPhotoReviewQueueItem,
  RecognitionPhotoReviewUpdateInput,
} from "@/types/recognition";

type PhotoReviewRow = {
  id: string;
  candidate_id: string;
  source_entry_id: string | null;
  original_width: number | null;
  original_height: number | null;
  crop_x: number | string | null;
  crop_y: number | string | null;
  crop_width: number | string | null;
  crop_height: number | string | null;
  crop_aspect_ratio: string;
  flags: string[] | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  crop_finalized_at: string | null;
  crop_finalized_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapPhotoReview(row: PhotoReviewRow): RecognitionPhotoReview {
  const crop = parseRecognitionNormalizedCrop({
    x: row.crop_x,
    y: row.crop_y,
    width: row.crop_width,
    height: row.crop_height,
  });
  return {
    id: row.id,
    candidateId: row.candidate_id,
    sourceEntryId: row.source_entry_id,
    originalWidth: row.original_width,
    originalHeight: row.original_height,
    crop: crop && validateRecognitionNormalizedCrop(crop) === null ? crop : crop,
    cropAspectRatio: row.crop_aspect_ratio || RECOGNITION_PRESENTATION_CROP_ASPECT.label,
    flags: (row.flags ?? []).filter((flag): flag is RecognitionPhotoReviewFlag => (
      flag === "group_photo"
      || flag === "person_too_small"
      || flag === "text_heavy"
      || flag === "low_resolution"
      || flag === "blurry_or_unclear"
      || flag === "poor_composition"
      || flag === "wrong_orientation"
      || flag === "suspected_wrong_photo"
      || flag === "other"
    )),
    isBlocked: Boolean(row.is_blocked),
    blockedReason: row.blocked_reason,
    cropFinalizedAt: row.crop_finalized_at,
    cropFinalizedByMemberId: row.crop_finalized_by_member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function photoReviewInputFrom(
  item: {
    requiresPhoto: boolean;
    reviewStatus: RecognitionPhotoReviewQueueItem["candidate"]["reviewStatus"];
    hasOriginalPhoto: boolean;
    preferredSourceEntryId: string | null;
    sources: Array<{ submissionEntryId: string; hasOriginalPhoto: boolean }>;
  },
  review: RecognitionPhotoReview | null,
) {
  const preferred = item.preferredSourceEntryId
    ? item.sources.find((source) => source.submissionEntryId === item.preferredSourceEntryId)
    : undefined;
  return {
    requiresPhoto: item.requiresPhoto,
    reviewStatus: item.reviewStatus,
    hasOriginalPhoto: item.hasOriginalPhoto,
    preferredSourceEntryId: item.preferredSourceEntryId,
    preferredSourceBelongsToCandidate: item.preferredSourceEntryId
      ? item.sources.some((source) => source.submissionEntryId === item.preferredSourceEntryId)
      : undefined,
    preferredSourceHasOriginalPhoto: preferred ? preferred.hasOriginalPhoto : undefined,
    photoReview: review
      ? {
          sourceEntryId: review.sourceEntryId,
          crop: review.crop,
          isBlocked: review.isBlocked,
          blockedReason: review.blockedReason,
          flags: review.flags,
          originalWidth: review.originalWidth,
          originalHeight: review.originalHeight,
        }
      : null,
  };
}

export async function loadRecognitionPhotoReviewsByCandidateIds(
  candidateIds: string[],
): Promise<Map<string, RecognitionPhotoReview>> {
  const reviews = new Map<string, RecognitionPhotoReview>();
  if (candidateIds.length === 0) return reviews;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_candidate_photo_reviews")
    .select("*")
    .in("candidate_id", candidateIds);
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  for (const row of (data ?? []) as PhotoReviewRow[]) {
    reviews.set(row.candidate_id, mapPhotoReview(row));
  }
  return reviews;
}

export async function listRecognitionPhotoReviewQueue(
  eventId: string,
  filter: RecognitionPhotoReviewQueueFilter = "all-photo-required",
): Promise<{
  items: RecognitionPhotoReviewQueueItem[];
  pptReadiness: RecognitionEventPptReadiness;
}> {
  const candidates = await loadRecognitionCandidatesForEvent(eventId);
  const reviews = await loadRecognitionPhotoReviewsByCandidateIds(candidates.map((item) => item.id));
  const items: RecognitionPhotoReviewQueueItem[] = candidates
    .filter((candidate) => candidate.requiresPhoto)
    .map((candidate) => {
      const photoReview = reviews.get(candidate.id) ?? null;
      const preferredSource = candidate.preferredSourceEntryId
        ? candidate.sources.find((source) => source.submissionEntryId === candidate.preferredSourceEntryId) ?? null
        : null;
      const validation = validateRecognitionPresentationPhoto(
        photoReviewInputFrom(candidate, photoReview),
      );
      return { candidate, photoReview, preferredSource, validation };
    })
    .filter((item) => matchesRecognitionPhotoReviewQueueFilter({
      requiresPhoto: item.candidate.requiresPhoto,
      readinessState: item.validation.readinessState,
      filter,
    }));

  return {
    items,
    pptReadiness: buildRecognitionEventPptReadiness({
      candidates: candidates.map((candidate) => photoReviewInputFrom(candidate, reviews.get(candidate.id) ?? null)),
    }),
  };
}

export async function getRecognitionEventPptReadiness(
  eventId: string,
): Promise<RecognitionEventPptReadiness> {
  const { pptReadiness } = await listRecognitionPhotoReviewQueue(eventId, "all-photo-required");
  return pptReadiness;
}

export async function getRecognitionCandidatePhotoReview(
  eventId: string,
  candidateId: string,
): Promise<RecognitionPhotoReviewQueueItem> {
  const { items } = await listRecognitionPhotoReviewQueue(eventId, "all-photo-required");
  const item = items.find((entry) => entry.candidate.id === candidateId);
  if (item) return item;

  const candidate = await getRecognitionCandidate(eventId, candidateId);
  const reviews = await loadRecognitionPhotoReviewsByCandidateIds([candidateId]);
  const photoReview = reviews.get(candidateId) ?? null;
  return {
    candidate,
    photoReview,
    preferredSource: candidate.preferredSourceEntryId
      ? candidate.sources.find((source) => source.submissionEntryId === candidate.preferredSourceEntryId) ?? null
      : null,
    validation: validateRecognitionPresentationPhoto(photoReviewInputFrom(candidate, photoReview)),
  };
}

function mapPhotoReviewRpcError(error: { message?: string; code?: string } | null): RecognitionServiceError {
  const message = error?.message ?? "Failed to save photo review.";
  if (
    error?.code === "40001"
    || message.includes("preferred source changed")
  ) {
    return new RecognitionServiceError(RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR, 409);
  }
  if (message.includes("not found")) {
    return new RecognitionServiceError(message, 404);
  }
  return new RecognitionServiceError(message, 400);
}

export async function updateRecognitionCandidatePhotoReview(
  eventId: string,
  candidateId: string,
  input: RecognitionPhotoReviewUpdateInput,
  adminMemberId: string,
): Promise<RecognitionPhotoReviewQueueItem> {
  const current = await getRecognitionCandidate(eventId, candidateId);
  if (!current.requiresPhoto) {
    throw new RecognitionServiceError("name-only awards do not use presentation crops.", 400);
  }
  if (!input.sourceEntryId) {
    throw new RecognitionServiceError("sourceEntryId is required.", 400);
  }
  if (current.preferredSourceEntryId !== input.sourceEntryId) {
    throw new RecognitionServiceError(RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR, 409);
  }

  const preferred = current.sources.find((source) => source.submissionEntryId === input.sourceEntryId);
  if (!preferred) {
    throw new RecognitionServiceError("source entry does not belong to this candidate", 400);
  }
  if (!preferred.hasOriginalPhoto) {
    throw new RecognitionServiceError("preferred source has no original photo", 400);
  }

  const existing = (await loadRecognitionPhotoReviewsByCandidateIds([candidateId])).get(candidateId) ?? null;
  const existingCropMatches = existing
    && existing.sourceEntryId === input.sourceEntryId
    && existing.crop
    && validateRecognitionNormalizedCrop(existing.crop) === null
    ? existing.crop
    : null;

  let crop: RecognitionNormalizedCrop | null;
  if (input.crop === undefined) {
    crop = existingCropMatches;
  } else if (input.crop === null) {
    crop = null;
  } else {
    const cropError = validateRecognitionNormalizedCrop(input.crop);
    if (cropError) {
      throw new RecognitionServiceError(cropError, 400);
    }
    crop = input.crop;
  }
  if (input.finalize && !crop) {
    throw new RecognitionServiceError("cannot finalize crop without valid coordinates", 400);
  }
  const flags = input.flags ?? existing?.flags ?? [];
  if (input.flags) {
    const flagError = validateRecognitionPhotoReviewFlags(input.flags);
    if (flagError) {
      throw new RecognitionServiceError(flagError, 400);
    }
  }
  const isBlocked = input.isBlocked ?? existing?.isBlocked ?? false;
  const blockedReason = input.isBlocked === false
    ? null
    : (input.blockedReason !== undefined ? input.blockedReason : existing?.blockedReason ?? null);

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("upsert_recognition_candidate_photo_review", {
    p_candidate_id: candidateId,
    p_source_entry_id: input.sourceEntryId,
    p_crop_x: crop?.x ?? null,
    p_crop_y: crop?.y ?? null,
    p_crop_width: crop?.width ?? null,
    p_crop_height: crop?.height ?? null,
    p_crop_aspect_ratio: RECOGNITION_PRESENTATION_CROP_ASPECT.label,
    p_original_width: input.originalWidth ?? null,
    p_original_height: input.originalHeight ?? null,
    p_flags: flags,
    p_is_blocked: isBlocked,
    p_blocked_reason: blockedReason,
    p_finalize: input.finalize === true,
    p_admin_member_id: adminMemberId,
  });

  if (error || !data) {
    throw mapPhotoReviewRpcError(error);
  }

  return getRecognitionCandidatePhotoReview(eventId, candidateId);
}

export async function resetRecognitionCandidatePhotoReview(candidateId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("reset_recognition_candidate_photo_review", {
    p_candidate_id: candidateId,
  });
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
}
