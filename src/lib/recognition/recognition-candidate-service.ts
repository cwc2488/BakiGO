import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  buildRecognitionApprovedRoster,
  candidateMatchesRecognitionFilters,
  detectRecognitionCandidateWarnings,
  findRecognitionDisplayNameCollision,
  formatRecognitionTextRoster,
  validateRecognitionCandidateReorderInput,
  validateRecognitionPhotoRequiredApproval,
  validateRecognitionPreferredPhotoSource,
  validateRecognitionReviewStatus,
} from "@/lib/recognition/recognition-candidates";
import { parseRecognitionNormalizedCrop } from "@/lib/recognition/recognition-photo-review";
import {
  getRecognitionEvent,
  listEventAwards,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import type {
  RecognitionApprovedRoster,
  RecognitionCandidate,
  RecognitionCandidateSource,
  RecognitionCandidateUpdateInput,
  RecognitionConsolidationResult,
  RecognitionNormalizedCrop,
  RecognitionPhotoReviewFlag,
  RecognitionReviewStatus,
} from "@/types/recognition";

type CandidateRow = {
  id: string;
  event_id: string;
  event_award_id: string;
  display_name: string;
  normalized_name: string;
  review_status: RecognitionReviewStatus;
  member_id: string | null;
  preferred_source_entry_id: string | null;
  sort_order: number;
  reviewed_at: string | null;
  reviewed_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  candidate_id: string;
  submission_entry_id: string;
  created_at: string;
};

type EntryRow = {
  id: string;
  submission_id: string;
  event_id: string;
  event_award_id: string;
  submitted_name: string;
  normalized_name: string;
  original_photo_storage_path: string | null;
  original_photo_mime_type: string | null;
  original_photo_size_bytes: number | null;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  submitter_name: string;
  submitter_organization: string;
  submitted_at: string;
};

export type RecognitionCandidateListFilter = {
  status?: RecognitionReviewStatus | "all" | "photo-required" | "warnings";
  eventAwardId?: string;
  query?: string;
};

async function requireEvent(eventId: string) {
  const event = await getRecognitionEvent(eventId);
  if (!event) {
    throw new RecognitionServiceError("Event not found.", 404);
  }
  return event;
}

export async function syncRecognitionEventCandidates(
  eventId: string,
): Promise<RecognitionConsolidationResult> {
  await requireEvent(eventId);
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("consolidate_recognition_event_candidates", {
    p_event_id: eventId,
  });
  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to sync candidates.", 500);
  }
  const payload = data as Record<string, unknown>;
  return {
    eventId: String(payload.eventId ?? eventId),
    candidateCount: Number(payload.candidateCount ?? 0),
    sourceLinkCount: Number(payload.sourceLinkCount ?? 0),
    createdCandidateCount: Number(payload.createdCandidateCount ?? 0),
    createdSourceLinkCount: Number(payload.createdSourceLinkCount ?? 0),
  };
}

export async function listRecognitionCandidates(
  eventId: string,
  filter: RecognitionCandidateListFilter = {},
): Promise<RecognitionCandidate[]> {
  const candidates = await loadRecognitionCandidates(eventId);
  return candidates.filter((candidate) => candidateMatchesRecognitionFilters({
    candidate,
    status: filter.status,
    eventAwardId: filter.eventAwardId,
    query: filter.query,
  }));
}

export async function getRecognitionCandidate(
  eventId: string,
  candidateId: string,
): Promise<RecognitionCandidate> {
  const candidates = await loadRecognitionCandidates(eventId);
  const candidate = candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new RecognitionServiceError("Candidate not found.", 404);
  }
  return candidate;
}

export async function updateRecognitionCandidate(
  eventId: string,
  candidateId: string,
  input: RecognitionCandidateUpdateInput,
  reviewedByMemberId: string,
): Promise<RecognitionCandidate> {
  await requireEvent(eventId);
  const current = await getRecognitionCandidate(eventId, candidateId);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.reviewStatus !== undefined) {
    const statusError = validateRecognitionReviewStatus(input.reviewStatus);
    if (statusError) {
      throw new RecognitionServiceError(statusError, 400);
    }
    patch.review_status = input.reviewStatus;
    patch.reviewed_at = new Date().toISOString();
    patch.reviewed_by_member_id = reviewedByMemberId;
  }

  if (input.displayName !== undefined) {
    const nextName = input.displayName.trim();
    if (!nextName) {
      throw new RecognitionServiceError("display_name is required.", 400);
    }
    if (nextName.length > 100) {
      throw new RecognitionServiceError("display_name 長度不可超過 100 字。", 400);
    }
    const siblings = (await loadRecognitionCandidates(eventId)).map((candidate) => ({
      id: candidate.id,
      eventAwardId: candidate.eventAwardId,
      displayName: candidate.displayName,
    }));
    const collision = findRecognitionDisplayNameCollision({
      candidateId,
      eventAwardId: current.eventAwardId,
      nextDisplayName: nextName,
      candidates: siblings,
    });
    if (collision) {
      throw new RecognitionServiceError(
        `此姓名與同項目中的「${collision.displayName}」重複，系統不會自動合併。`,
        409,
      );
    }
    patch.display_name = nextName;
    // normalized_name stays as the original consolidation key.
  }

  if (input.preferredSourceEntryId !== undefined) {
    if (input.preferredSourceEntryId === null) {
      patch.preferred_source_entry_id = null;
    } else {
      const photoError = validateRecognitionPreferredPhotoSource({
        preferredSourceEntryId: input.preferredSourceEntryId,
        sourceEntryIds: current.sources.map((source) => source.submissionEntryId),
        photoSourceEntryIds: current.sources
          .filter((source) => source.hasOriginalPhoto)
          .map((source) => source.submissionEntryId),
      });
      if (photoError) {
        throw new RecognitionServiceError(photoError, 400);
      }
      patch.preferred_source_entry_id = input.preferredSourceEntryId;
    }
  }

  const nextPreferredSourceEntryId = input.preferredSourceEntryId !== undefined
    ? input.preferredSourceEntryId
    : current.preferredSourceEntryId;
  if (input.reviewStatus === "approved") {
    const approvalError = validateRecognitionPhotoRequiredApproval({
      requiresPhoto: current.requiresPhoto,
      preferredSourceEntryId: nextPreferredSourceEntryId,
      sourceEntryIds: current.sources.map((source) => source.submissionEntryId),
      photoSourceEntryIds: current.sources
        .filter((source) => source.hasOriginalPhoto)
        .map((source) => source.submissionEntryId),
    });
    if (approvalError) {
      throw new RecognitionServiceError(approvalError, 400);
    }
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_candidates")
    .update(patch)
    .eq("id", candidateId)
    .eq("event_id", eventId)
    .select("id")
    .single();

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to update candidate.", 500);
  }

  const preferredSourceChanged = input.preferredSourceEntryId !== undefined
    && input.preferredSourceEntryId !== current.preferredSourceEntryId;
  if (preferredSourceChanged) {
    const reset = await supabase.rpc("reset_recognition_candidate_photo_review", {
      p_candidate_id: candidateId,
    });
    if (reset.error) {
      throw new RecognitionServiceError(reset.error.message, 500);
    }
  }

  return getRecognitionCandidate(eventId, candidateId);
}

export async function reorderRecognitionCandidates(
  eventId: string,
  eventAwardId: string,
  orderedCandidateIds: string[],
): Promise<void> {
  await requireEvent(eventId);
  const current = (await loadRecognitionCandidates(eventId))
    .filter((candidate) => candidate.eventAwardId === eventAwardId);
  const validationError = validateRecognitionCandidateReorderInput(
    orderedCandidateIds,
    current.map((candidate) => candidate.id),
  );
  if (validationError) {
    throw new RecognitionServiceError(validationError, 400);
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("reorder_recognition_event_candidates", {
    p_event_id: eventId,
    p_event_award_id: eventAwardId,
    p_candidate_ids: orderedCandidateIds,
  });
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
}

export async function getRecognitionApprovedRoster(eventId: string): Promise<RecognitionApprovedRoster> {
  const event = await requireEvent(eventId);
  const awards = await listEventAwards(eventId);
  const candidates = await loadRecognitionCandidates(eventId);
  const photoReviews = await loadPhotoReviewsForRoster(candidates.map((candidate) => candidate.id));
  return buildRecognitionApprovedRoster({
    eventId: event.id,
    eventName: event.name,
    year: event.year,
    month: event.month,
    awards: awards.map((award) => ({
      eventAwardId: award.id,
      awardName: award.awardName ?? "",
      sortOrder: award.sortOrder,
      isEnabled: award.isEnabled,
      requiresPhoto: award.requiresPhoto ?? false,
    })),
    candidates: candidates.map((candidate) => {
      const photoReview = photoReviews.get(candidate.id);
      const preferred = candidate.preferredSourceEntryId
        ? candidate.sources.find((source) => source.submissionEntryId === candidate.preferredSourceEntryId)
        : undefined;
      return {
        id: candidate.id,
        eventAwardId: candidate.eventAwardId,
        reviewStatus: candidate.reviewStatus,
        displayName: candidate.displayName,
        sortOrder: candidate.sortOrder,
        createdAt: candidate.createdAt,
        preferredSourceEntryId: candidate.preferredSourceEntryId,
        hasOriginalPhoto: candidate.hasOriginalPhoto,
        preferredSourceBelongsToCandidate: candidate.preferredSourceEntryId
          ? Boolean(preferred)
          : undefined,
        preferredSourceHasOriginalPhoto: preferred ? preferred.hasOriginalPhoto : undefined,
        photoReview: photoReview ?? null,
      };
    }),
  });
}

async function loadPhotoReviewsForRoster(candidateIds: string[]): Promise<Map<string, {
  sourceEntryId: string | null;
  crop: RecognitionNormalizedCrop | null;
  isBlocked: boolean;
  blockedReason?: string | null;
  flags?: RecognitionPhotoReviewFlag[];
}>> {
  const result = new Map<string, {
    sourceEntryId: string | null;
    crop: RecognitionNormalizedCrop | null;
    isBlocked: boolean;
    blockedReason?: string | null;
    flags?: RecognitionPhotoReviewFlag[];
  }>();
  if (candidateIds.length === 0) return result;
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_candidate_photo_reviews")
    .select("candidate_id, source_entry_id, crop_x, crop_y, crop_width, crop_height, flags, is_blocked, blocked_reason")
    .in("candidate_id", candidateIds);
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  for (const row of (data ?? []) as Array<{
    candidate_id: string;
    source_entry_id: string | null;
    crop_x: number | string | null;
    crop_y: number | string | null;
    crop_width: number | string | null;
    crop_height: number | string | null;
    flags: string[] | null;
    is_blocked: boolean;
    blocked_reason: string | null;
  }>) {
    result.set(row.candidate_id, {
      sourceEntryId: row.source_entry_id,
      crop: parseRecognitionNormalizedCrop({
        x: row.crop_x,
        y: row.crop_y,
        width: row.crop_width,
        height: row.crop_height,
      }),
      isBlocked: Boolean(row.is_blocked),
      blockedReason: row.blocked_reason,
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
    });
  }
  return result;
}

export async function getRecognitionTextRoster(eventId: string): Promise<{ text: string; roster: RecognitionApprovedRoster }> {
  const roster = await getRecognitionApprovedRoster(eventId);
  return { text: formatRecognitionTextRoster(roster), roster };
}

export async function getRecognitionCandidatePhotoObject(input: {
  eventId: string;
  candidateId: string;
  sourceEntryId: string;
}): Promise<{ path: string; mimeType: string; body: ArrayBuffer }> {
  const candidate = await getRecognitionCandidate(input.eventId, input.candidateId);
  const source = candidate.sources.find((item) => item.submissionEntryId === input.sourceEntryId);
  if (!source || !source.originalPhotoStoragePath) {
    throw new RecognitionServiceError("Photo is not part of this candidate's evidence.", 404);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from("recognition-photos")
    .download(source.originalPhotoStoragePath);

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to load photo.", 500);
  }

  return {
    path: source.originalPhotoStoragePath,
    mimeType: source.originalPhotoMimeType || "application/octet-stream",
    body: await data.arrayBuffer(),
  };
}

export async function loadRecognitionCandidatesForEvent(eventId: string) {
  return loadRecognitionCandidates(eventId);
}

async function loadRecognitionCandidates(eventId: string): Promise<RecognitionCandidate[]> {
  await requireEvent(eventId);
  const supabase = createSupabaseServiceClient();
  const awards = await listEventAwards(eventId);
  const awardMap = new Map(awards.map((award) => [award.id, award]));

  const { data: candidateData, error: candidateError } = await supabase
    .from("recognition_candidates")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (candidateError) {
    throw new RecognitionServiceError(candidateError.message, 500);
  }

  const candidateRows = (candidateData ?? []) as CandidateRow[];
  if (candidateRows.length === 0) return [];

  const candidateIds = candidateRows.map((row) => row.id);
  const { data: sourceData, error: sourceError } = await supabase
    .from("recognition_candidate_sources")
    .select("*")
    .in("candidate_id", candidateIds);

  if (sourceError) {
    throw new RecognitionServiceError(sourceError.message, 500);
  }

  const sourceRows = (sourceData ?? []) as SourceRow[];
  const entryIds = sourceRows.map((row) => row.submission_entry_id);
  const entriesById = new Map<string, EntryRow>();
  const submissionsById = new Map<string, SubmissionRow>();

  if (entryIds.length > 0) {
    const { data: entryData, error: entryError } = await supabase
      .from("recognition_submission_entries")
      .select("*")
      .in("id", entryIds);
    if (entryError) {
      throw new RecognitionServiceError(entryError.message, 500);
    }
    for (const row of (entryData ?? []) as EntryRow[]) {
      entriesById.set(row.id, row);
    }

    const submissionIds = [...new Set([...entriesById.values()].map((entry) => entry.submission_id))];
    if (submissionIds.length > 0) {
      const { data: submissionData, error: submissionError } = await supabase
        .from("recognition_submissions")
        .select("id, submitter_name, submitter_organization, submitted_at")
        .in("id", submissionIds);
      if (submissionError) {
        throw new RecognitionServiceError(submissionError.message, 500);
      }
      for (const row of (submissionData ?? []) as SubmissionRow[]) {
        submissionsById.set(row.id, row);
      }
    }
  }

  const sourcesByCandidate = new Map<string, RecognitionCandidateSource[]>();
  for (const source of sourceRows) {
    const entry = entriesById.get(source.submission_entry_id);
    const submission = entry ? submissionsById.get(entry.submission_id) : undefined;
    const award = entry ? awardMap.get(entry.event_award_id) : undefined;
    const mapped: RecognitionCandidateSource = {
      id: source.id,
      candidateId: source.candidate_id,
      submissionEntryId: source.submission_entry_id,
      submittedName: entry?.submitted_name ?? "",
      normalizedName: entry?.normalized_name ?? "",
      eventAwardId: entry?.event_award_id ?? "",
      awardName: award?.awardName ?? "",
      submitterName: submission?.submitter_name ?? "",
      submitterOrganization: submission?.submitter_organization ?? "",
      submittedAt: submission?.submitted_at ?? "",
      originalPhotoStoragePath: entry?.original_photo_storage_path ?? null,
      originalPhotoMimeType: entry?.original_photo_mime_type ?? null,
      hasOriginalPhoto: Boolean(entry?.original_photo_storage_path),
      createdAt: source.created_at,
    };
    const list = sourcesByCandidate.get(source.candidate_id) ?? [];
    list.push(mapped);
    sourcesByCandidate.set(source.candidate_id, list);
  }

  const warningInputs = candidateRows.map((row) => ({
    id: row.id,
    eventAwardId: row.event_award_id,
    awardName: awardMap.get(row.event_award_id)?.awardName ?? "",
    displayName: row.display_name,
    normalizedName: row.normalized_name,
  }));
  const warnings = detectRecognitionCandidateWarnings(warningInputs);

  return candidateRows
    .slice()
    .sort((a, b) => {
      const awardA = awardMap.get(a.event_award_id)?.sortOrder ?? 0;
      const awardB = awardMap.get(b.event_award_id)?.sortOrder ?? 0;
      if (awardA !== awardB) return awardA - awardB;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    })
    .map((row) => {
      const award = awardMap.get(row.event_award_id);
      const sources = (sourcesByCandidate.get(row.id) ?? []).sort((a, b) => (
        a.submittedAt.localeCompare(b.submittedAt) || a.createdAt.localeCompare(b.createdAt)
      ));
      const warning = warnings.get(row.id);
      const hasOriginalPhoto = sources.some((source) => source.hasOriginalPhoto);
      const requiresPhoto = award?.requiresPhoto ?? false;
      return {
        id: row.id,
        eventId: row.event_id,
        eventAwardId: row.event_award_id,
        awardName: award?.awardName ?? "",
        requiresPhoto,
        displayName: row.display_name,
        normalizedName: row.normalized_name,
        reviewStatus: row.review_status,
        memberId: row.member_id,
        preferredSourceEntryId: row.preferred_source_entry_id,
        sortOrder: row.sort_order,
        reviewedAt: row.reviewed_at,
        reviewedByMemberId: row.reviewed_by_member_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourceCount: sources.length,
        submitterOrganizations: [...new Set(sources.map((source) => source.submitterOrganization).filter(Boolean))],
        hasOriginalPhoto,
        missingRequiredPhoto: requiresPhoto && !hasOriginalPhoto,
        needsPreferredPhotoSelection: requiresPhoto && hasOriginalPhoto && !row.preferred_source_entry_id,
        crossAwardWarning: (warning?.crossAwardMatches.length ?? 0) > 0,
        suspectedDuplicateWarning: (warning?.suspectedDuplicates.length ?? 0) > 0,
        crossAwardMatches: (warning?.crossAwardMatches ?? []).map((match) => ({
          candidateId: match.id,
          eventAwardId: match.eventAwardId,
          awardName: match.awardName,
          displayName: match.displayName,
          normalizedName: match.normalizedName,
        })),
        suspectedDuplicates: (warning?.suspectedDuplicates ?? []).map((match) => ({
          candidateId: match.id,
          eventAwardId: match.eventAwardId,
          awardName: match.awardName,
          displayName: match.displayName,
          normalizedName: match.normalizedName,
        })),
        sources,
      };
    });
}

export function recognitionCandidatePatchTouchesRawEvidence(patchKeys: string[]): boolean {
  const forbidden = new Set([
    "submitted_name",
    "original_photo_storage_path",
    "submitter_name",
    "submitter_organization",
  ]);
  return patchKeys.some((key) => forbidden.has(key));
}
