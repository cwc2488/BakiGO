import { getRecognitionCandidatePhotoObject, loadRecognitionCandidatesForEvent } from "@/lib/recognition/recognition-candidate-service";
import { loadRecognitionPhotoReviewsByCandidateIds } from "@/lib/recognition/recognition-photo-review-service";
import { buildRecognitionPresentationData } from "@/lib/recognition/recognition-presentation-dto";
import { insertRecognitionPresentationExportSuccess } from "@/lib/recognition/recognition-presentation-exports";
import { recognitionPresentationFilename } from "@/lib/recognition/recognition-presentation-filename";
import { loadRecognitionPresentationPortraits } from "@/lib/recognition/recognition-presentation-images";
import {
  estimateRecognitionPresentationSlideCount,
  planRecognitionPresentation,
} from "@/lib/recognition/recognition-presentation-layout";
import { renderRecognitionPresentationPptx } from "@/lib/recognition/recognition-presentation-pptx";
import {
  formatRecognitionPresentationNotReadyError,
  listRecognitionPresentationPhotoBlockers,
} from "@/lib/recognition/recognition-presentation-readiness";
import { resolveRecognitionPresentationTheme } from "@/lib/recognition/recognition-presentation-theme";
import type {
  RecognitionPresentationData,
  RecognitionPresentationPhotoBlocker,
  RecognitionPresentationSummary,
  RecognitionSlidePlan,
} from "@/lib/recognition/recognition-presentation-types";
import {
  getRecognitionEvent,
  listEventAwards,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import type { RecognitionCandidate, RecognitionPhotoReview } from "@/types/recognition";

export class RecognitionPresentationNotReadyError extends RecognitionServiceError {
  constructor(readonly blockers: RecognitionPresentationPhotoBlocker[]) {
    super(formatRecognitionPresentationNotReadyError(blockers), 409);
    this.name = "RecognitionPresentationNotReadyError";
  }
}

export type RecognitionPresentationSnapshot = {
  data: RecognitionPresentationData;
  plan: RecognitionSlidePlan[];
  blockers: RecognitionPresentationPhotoBlocker[];
  candidates: RecognitionCandidate[];
};

function photoInputFromCandidate(
  candidate: RecognitionCandidate,
  review: RecognitionPhotoReview | null | undefined,
) {
  const preferred = candidate.preferredSourceEntryId
    ? candidate.sources.find((source) => source.submissionEntryId === candidate.preferredSourceEntryId)
    : undefined;
  return {
    id: candidate.id,
    displayName: candidate.displayName,
    reviewStatus: candidate.reviewStatus,
    requiresPhoto: candidate.requiresPhoto,
    hasOriginalPhoto: candidate.hasOriginalPhoto,
    originalPhotoStoragePath: preferred?.originalPhotoStoragePath
      ?? candidate.sources.find((source) => source.originalPhotoStoragePath)?.originalPhotoStoragePath
      ?? null,
    preferredSourceEntryId: candidate.preferredSourceEntryId,
    preferredSourceBelongsToCandidate: candidate.preferredSourceEntryId
      ? candidate.sources.some((source) => source.submissionEntryId === candidate.preferredSourceEntryId)
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

/**
 * Load event awards, approved roster, and crop metadata once.
 * Subsequent planning / rendering uses this snapshot only.
 * If candidate or crop data changes after this point, the in-flight generation
 * still finishes from the snapshot.
 */
export async function loadRecognitionPresentationSnapshot(
  eventId: string,
): Promise<RecognitionPresentationSnapshot> {
  const event = await getRecognitionEvent(eventId);
  if (!event) {
    throw new RecognitionServiceError("Recognition event not found.", 404);
  }

  const awards = await listEventAwards(eventId);
  const candidates = await loadRecognitionCandidatesForEvent(eventId);
  const reviews = await loadRecognitionPhotoReviewsByCandidateIds(
    candidates.map((candidate) => candidate.id),
  );

  const data = buildRecognitionPresentationData({
    event,
    awards: awards.map((award) => ({
      eventAwardId: award.id,
      awardSlug: award.awardSlug ?? "",
      awardName: award.awardName ?? "",
      sortOrder: award.sortOrder,
      isEnabled: award.isEnabled,
      requiresPhoto: Boolean(award.requiresPhoto),
    })),
    candidates,
    reviews,
  });
  const plan = planRecognitionPresentation(data);
  const blockers = listRecognitionPresentationPhotoBlockers({
    candidates: candidates.map((candidate) => photoInputFromCandidate(candidate, reviews.get(candidate.id))),
  });

  return { data, plan, blockers, candidates };
}

export function buildRecognitionPresentationSummary(
  snapshot: RecognitionPresentationSnapshot,
): RecognitionPresentationSummary {
  const approvedRecipientCount = snapshot.data.awards.reduce(
    (sum, award) => sum + award.candidates.length,
    0,
  );
  return {
    eventId: snapshot.data.event.id,
    eventName: snapshot.data.event.name,
    year: snapshot.data.event.year,
    month: snapshot.data.event.month,
    themeId: snapshot.data.themeId,
    themeVersion: snapshot.data.themeVersion,
    awardSectionCount: snapshot.data.awards.length,
    approvedRecipientCount,
    expectedSlideCount: estimateRecognitionPresentationSlideCount(snapshot.data),
    ready: snapshot.blockers.length === 0 && snapshot.plan.length > 0,
    blockers: snapshot.blockers,
  };
}

export async function getRecognitionPresentationSummary(
  eventId: string,
): Promise<RecognitionPresentationSummary> {
  const snapshot = await loadRecognitionPresentationSnapshot(eventId);
  return buildRecognitionPresentationSummary(snapshot);
}

export async function generateRecognitionPresentationPptx(input: {
  eventId: string;
  generatedByMemberId: string;
}): Promise<{
  buffer: Buffer;
  filename: string;
  slideCount: number;
  approvedCandidateCount: number;
}> {
  const snapshot = await loadRecognitionPresentationSnapshot(input.eventId);
  if (snapshot.blockers.length > 0) {
    throw new RecognitionPresentationNotReadyError(snapshot.blockers);
  }
  if (snapshot.plan.length === 0) {
    throw new RecognitionServiceError("尚無已核准名單，無法產生簡報", 409);
  }

  const theme = resolveRecognitionPresentationTheme(snapshot.data.themeId);
  const portraits = await loadRecognitionPresentationPortraits({
    data: snapshot.data,
    loadOriginal: getRecognitionCandidatePhotoObject,
  });
  const buffer = await renderRecognitionPresentationPptx({
    data: snapshot.data,
    plan: snapshot.plan,
    portraits,
    theme,
  });

  const approvedCandidateCount = snapshot.data.awards.reduce(
    (sum, award) => sum + award.candidates.length,
    0,
  );

  await insertRecognitionPresentationExportSuccess({
    eventId: snapshot.data.event.id,
    generatedByMemberId: input.generatedByMemberId,
    approvedCandidateCount,
    slideCount: snapshot.plan.length,
    themeId: theme.id,
    themeVersion: theme.version,
  });

  return {
    buffer,
    filename: recognitionPresentationFilename(snapshot.data.event),
    slideCount: snapshot.plan.length,
    approvedCandidateCount,
  };
}
