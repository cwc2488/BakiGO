import { normalizeRecognitionSubmittedName } from "@/lib/recognition/recognition-domain";
import {
  cropMatchesPreferredSource,
  isRecognitionPresentationPhotoReady,
  recognitionPresentationPhotoReadinessState,
  type RecognitionPresentationPhotoInput,
} from "@/lib/recognition/recognition-photo-review";
import type {
  RecognitionApprovedRoster,
  RecognitionApprovedRosterAward,
  RecognitionCandidate,
  RecognitionNormalizedCrop,
  RecognitionPhotoReviewFlag,
  RecognitionReviewStatus,
} from "@/types/recognition";

export const RECOGNITION_REVIEW_STATUSES: readonly RecognitionReviewStatus[] = [
  "pending",
  "approved",
  "needs_fix",
  "rejected",
] as const;

/** Trailing honorifics used only for suspected-duplicate review aids. Never used to auto-merge. */
export const RECOGNITION_SUSPECTED_DUPLICATE_SUFFIXES = ["老師", "督導", "先生", "組"] as const;

export function isRecognitionReviewStatus(value: string): value is RecognitionReviewStatus {
  return (RECOGNITION_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function validateRecognitionReviewStatus(value: string): string | null {
  if (!isRecognitionReviewStatus(value)) {
    return "review_status must be pending, approved, needs_fix, or rejected.";
  }
  return null;
}

export function recognitionConsolidationKey(input: {
  eventId: string;
  eventAwardId: string;
  normalizedName: string;
}): string {
  return `${input.eventId}::${input.eventAwardId}::${input.normalizedName}`;
}

export function groupEntriesForRecognitionConsolidation<T extends {
  eventId: string;
  eventAwardId: string;
  normalizedName: string;
}>(entries: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = recognitionConsolidationKey(entry);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return groups;
}

/**
 * Conservative suspected-duplicate key.
 * Strips remaining spaces and trailing frozen honorifics.
 * Never used as a consolidation key.
 */
export function recognitionSuspectedDuplicateKey(normalizedName: string): string {
  let compact = normalizeRecognitionSubmittedName(normalizedName).replace(/\s+/g, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of RECOGNITION_SUSPECTED_DUPLICATE_SUFFIXES) {
      if (compact.endsWith(suffix) && compact.length > suffix.length) {
        compact = compact.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return compact;
}

export type RecognitionCandidateWarningInput = {
  id: string;
  eventAwardId: string;
  awardName: string;
  displayName: string;
  normalizedName: string;
};

export type RecognitionCandidateWarningMap = Map<string, {
  crossAwardMatches: RecognitionCandidateWarningInput[];
  suspectedDuplicates: RecognitionCandidateWarningInput[];
}>;

export function detectRecognitionCandidateWarnings(
  candidates: RecognitionCandidateWarningInput[],
): RecognitionCandidateWarningMap {
  const result: RecognitionCandidateWarningMap = new Map();
  for (const candidate of candidates) {
    result.set(candidate.id, { crossAwardMatches: [], suspectedDuplicates: [] });
  }

  for (const candidate of candidates) {
    const bucket = result.get(candidate.id);
    if (!bucket) continue;
    const suspectedKey = recognitionSuspectedDuplicateKey(candidate.normalizedName);
    for (const other of candidates) {
      if (other.id === candidate.id) continue;
      if (
        other.normalizedName === candidate.normalizedName
        && other.eventAwardId !== candidate.eventAwardId
      ) {
        bucket.crossAwardMatches.push(other);
        continue;
      }
      if (other.normalizedName === candidate.normalizedName) continue;
      if (suspectedKey.length < 2) continue;
      if (recognitionSuspectedDuplicateKey(other.normalizedName) === suspectedKey) {
        bucket.suspectedDuplicates.push(other);
      }
    }
  }
  return result;
}

export function findRecognitionDisplayNameCollision(input: {
  candidateId: string;
  eventAwardId: string;
  nextDisplayName: string;
  candidates: Array<{ id: string; eventAwardId: string; displayName: string }>;
}): { id: string; displayName: string } | null {
  const next = normalizeRecognitionSubmittedName(input.nextDisplayName);
  if (!next) return null;
  for (const other of input.candidates) {
    if (other.id === input.candidateId) continue;
    if (other.eventAwardId !== input.eventAwardId) continue;
    if (normalizeRecognitionSubmittedName(other.displayName) === next) {
      return { id: other.id, displayName: other.displayName };
    }
  }
  return null;
}

export const RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR =
  "此表揚項目需要照片，請先選擇正式使用的照片。";

export function validateRecognitionPreferredPhotoSource(input: {
  preferredSourceEntryId: string;
  sourceEntryIds: string[];
  photoSourceEntryIds: string[];
}): string | null {
  if (!input.sourceEntryIds.includes(input.preferredSourceEntryId)) {
    return "preferred photo must belong to this candidate's evidence.";
  }
  if (!input.photoSourceEntryIds.includes(input.preferredSourceEntryId)) {
    return "preferred photo source has no original photo.";
  }
  return null;
}

export function validateRecognitionPhotoRequiredApproval(input: {
  requiresPhoto: boolean;
  preferredSourceEntryId: string | null | undefined;
  sourceEntryIds: string[];
  photoSourceEntryIds: string[];
}): string | null {
  if (!input.requiresPhoto) return null;
  if (input.photoSourceEntryIds.length === 0) {
    return RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR;
  }
  if (!input.preferredSourceEntryId) {
    return RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR;
  }
  const preferredError = validateRecognitionPreferredPhotoSource({
    preferredSourceEntryId: input.preferredSourceEntryId,
    sourceEntryIds: input.sourceEntryIds,
    photoSourceEntryIds: input.photoSourceEntryIds,
  });
  if (preferredError) return RECOGNITION_PHOTO_REQUIRED_APPROVAL_ERROR;
  return null;
}

export type RecognitionCandidatePhotoReadiness =
  | "not_required"
  | "missing_photo"
  | "needs_preferred_selection"
  | "preferred_selected";

export function recognitionCandidatePhotoReadiness(input: {
  requiresPhoto: boolean;
  hasOriginalPhoto: boolean;
  preferredSourceEntryId: string | null;
}): RecognitionCandidatePhotoReadiness {
  if (!input.requiresPhoto) return "not_required";
  if (!input.hasOriginalPhoto) return "missing_photo";
  if (!input.preferredSourceEntryId) return "needs_preferred_selection";
  return "preferred_selected";
}

export function compareRecognitionCandidateOrder<T extends {
  sortOrder: number;
  createdAt: string;
  displayName: string;
}>(a: T, b: T): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const created = a.createdAt.localeCompare(b.createdAt);
  if (created !== 0) return created;
  return a.displayName.localeCompare(b.displayName, "zh-Hant");
}

export function buildRecognitionApprovedRoster(input: {
  eventId: string;
  eventName: string;
  year: number;
  month: number;
  awards: Array<{
    eventAwardId: string;
    awardName: string;
    sortOrder: number;
    isEnabled: boolean;
    requiresPhoto: boolean;
  }>;
  candidates: Array<{
    id: string;
    eventAwardId: string;
    reviewStatus: RecognitionReviewStatus;
    displayName: string;
    sortOrder: number;
    createdAt: string;
    preferredSourceEntryId: string | null;
    hasOriginalPhoto: boolean;
    preferredSourceBelongsToCandidate?: boolean;
    preferredSourceHasOriginalPhoto?: boolean;
    photoReview?: {
      sourceEntryId: string | null;
      crop: RecognitionNormalizedCrop | null;
      isBlocked: boolean;
      blockedReason?: string | null;
      flags?: RecognitionPhotoReviewFlag[];
    } | null;
  }>;
}): RecognitionApprovedRoster {
  const awards: RecognitionApprovedRosterAward[] = [...input.awards]
    .filter((award) => award.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((award) => ({
      eventAwardId: award.eventAwardId,
      awardName: award.awardName,
      sortOrder: award.sortOrder,
      requiresPhoto: award.requiresPhoto,
      candidates: input.candidates
        .filter((candidate) => (
          candidate.eventAwardId === award.eventAwardId
          && candidate.reviewStatus === "approved"
        ))
        .sort(compareRecognitionCandidateOrder)
        .map((candidate) => {
          const photoInput: RecognitionPresentationPhotoInput = {
            requiresPhoto: award.requiresPhoto,
            reviewStatus: candidate.reviewStatus,
            hasOriginalPhoto: candidate.hasOriginalPhoto,
            preferredSourceEntryId: candidate.preferredSourceEntryId,
            preferredSourceBelongsToCandidate: candidate.preferredSourceBelongsToCandidate,
            preferredSourceHasOriginalPhoto: candidate.preferredSourceHasOriginalPhoto,
            photoReview: candidate.photoReview ?? null,
          };
          return {
            id: candidate.id,
            displayName: candidate.displayName,
            sortOrder: candidate.sortOrder,
            preferredSourceEntryId: candidate.preferredSourceEntryId,
            hasOriginalPhoto: candidate.hasOriginalPhoto,
            hasPreferredPhoto: Boolean(candidate.preferredSourceEntryId),
            hasPresentationCrop: cropMatchesPreferredSource({
              crop: candidate.photoReview?.crop,
              cropSourceEntryId: candidate.photoReview?.sourceEntryId,
              preferredSourceEntryId: candidate.preferredSourceEntryId,
            }),
            photoReady: isRecognitionPresentationPhotoReady(photoInput),
            requiresPhoto: award.requiresPhoto,
            photoReadinessState: recognitionPresentationPhotoReadinessState(photoInput),
            photoFlags: candidate.photoReview?.flags ?? [],
            photoBlockReason: candidate.photoReview?.isBlocked
              ? (candidate.photoReview.blockedReason ?? "此照片已標記為不可用於簡報")
              : null,
          };
        }),
    }));

  return {
    eventId: input.eventId,
    eventName: input.eventName,
    year: input.year,
    month: input.month,
    awards,
  };
}

export function formatRecognitionTextRoster(roster: RecognitionApprovedRoster): string {
  const title = `${roster.year} 年 ${roster.month} 月 ${roster.eventName}`;
  const sections = roster.awards
    .filter((award) => award.candidates.length > 0)
    .map((award) => [award.awardName, ...award.candidates.map((candidate) => candidate.displayName)].join("\n"));
  return [title, ...sections].join("\n\n").trimEnd() + "\n";
}

export function textRosterContainsInternalId(text: string): boolean {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text);
}

export function candidateMatchesRecognitionFilters(input: {
  candidate: Pick<
    RecognitionCandidate,
    | "reviewStatus"
    | "requiresPhoto"
    | "missingRequiredPhoto"
    | "needsPreferredPhotoSelection"
    | "crossAwardWarning"
    | "suspectedDuplicateWarning"
    | "eventAwardId"
    | "displayName"
    | "normalizedName"
    | "sources"
  >;
  status?: RecognitionReviewStatus | "all" | "photo-required" | "warnings";
  eventAwardId?: string;
  query?: string;
}): boolean {
  if (input.eventAwardId && input.candidate.eventAwardId !== input.eventAwardId) {
    return false;
  }
  if (input.status && input.status !== "all") {
    if (input.status === "photo-required" && !input.candidate.requiresPhoto) return false;
    if (input.status === "warnings") {
      const hasWarning = (
        input.candidate.crossAwardWarning
        || input.candidate.suspectedDuplicateWarning
        || input.candidate.missingRequiredPhoto
        || input.candidate.needsPreferredPhotoSelection
      );
      if (!hasWarning) return false;
    }
    if (
      input.status !== "photo-required"
      && input.status !== "warnings"
      && input.candidate.reviewStatus !== input.status
    ) {
      return false;
    }
  }
  const query = input.query?.trim();
  if (query) {
    const haystack = [
      input.candidate.displayName,
      input.candidate.normalizedName,
      ...input.candidate.sources.map((source) => source.submittedName),
    ].join(" ").toLocaleLowerCase();
    if (!haystack.includes(query.toLocaleLowerCase())) return false;
  }
  return true;
}

export function validateRecognitionCandidateReorderInput(
  orderedCandidateIds: string[],
  currentCandidateIds: string[],
): string | null {
  if (orderedCandidateIds.length === 0) {
    return "ordered candidate ids are required.";
  }
  const uniqueIncoming = new Set(orderedCandidateIds);
  if (uniqueIncoming.size !== orderedCandidateIds.length) {
    return "ordered candidate ids contain duplicates.";
  }
  if (orderedCandidateIds.length !== currentCandidateIds.length) {
    return "ordered candidate ids must include the complete current award candidate set.";
  }
  const currentSet = new Set(currentCandidateIds);
  if (!orderedCandidateIds.every((id) => currentSet.has(id))) {
    return "ordered candidate ids must all belong to the target event award.";
  }
  return null;
}
