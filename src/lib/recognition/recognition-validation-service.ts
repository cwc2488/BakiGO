import sharp from "sharp";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  loadRecognitionCandidatesForEvent,
  syncRecognitionEventCandidates,
} from "@/lib/recognition/recognition-candidate-service";
import {
  defaultRecognitionCoverCrop,
  RECOGNITION_PRESENTATION_CROP_ASPECT,
  validateRecognitionNormalizedCrop,
} from "@/lib/recognition/recognition-photo-review";
import {
  parseRecognitionPhotoRef,
  RECOGNITION_PHOTOS_BUCKET,
} from "@/lib/recognition/recognition-photo-url";
import { decodeRecognitionOriginalForPresentation } from "@/lib/recognition/recognition-presentation-images";
import {
  getRecognitionEvent,
  listEventAwards,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import { normalizeRecognitionSubmittedName } from "@/lib/recognition/recognition-domain";
import {
  aggregateRecognitionEventDashboardCounts,
  evaluateRecognitionEntryValidation,
  isRecognitionPptReadyStatus,
  recognitionAuthoritativePhotoPath,
  summarizeRecognitionSubmissionCompletion,
  type RecognitionEventDashboardCountInput,
  type RecognitionImageInspectResult,
} from "@/lib/recognition/recognition-validation";
import type {
  RecognitionAdminOverrideAudit,
  RecognitionEventDashboard,
  RecognitionExceptionItem,
  RecognitionNormalizedCrop,
  RecognitionSubmissionCompletion,
  RecognitionValidationIssue,
  RecognitionValidationStatus,
} from "@/types/recognition";

export type RecognitionEntryRow = {
  id: string;
  submission_id: string;
  event_id: string;
  event_award_id: string;
  submitted_name: string;
  normalized_name: string;
  original_photo_storage_path: string | null;
  original_photo_mime_type: string | null;
  original_photo_size_bytes: number | null;
  current_photo_storage_path?: string | null;
  current_photo_mime_type?: string | null;
  current_photo_size_bytes?: number | null;
  confirmed_crop?: RecognitionNormalizedCrop | null;
  original_width?: number | null;
  original_height?: number | null;
  submitter_confirmed_warnings?: string[] | null;
  validation_status?: string | null;
  validation_issues?: RecognitionValidationIssue[] | null;
  admin_override_json?: RecognitionAdminOverrideAudit | null;
  excluded_at?: string | null;
  excluded_by_member_id?: string | null;
  excluded_reason?: string | null;
  created_at: string;
};

function parseIssues(value: unknown): RecognitionValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecognitionValidationIssue => (
    Boolean(item)
    && typeof item === "object"
    && typeof (item as RecognitionValidationIssue).code === "string"
  ));
}

function parseOverride(value: unknown): RecognitionAdminOverrideAudit | null {
  if (!value || typeof value !== "object") return null;
  const row = value as RecognitionAdminOverrideAudit;
  if (!row.overriddenBy || !row.originalStatus) return null;
  return row;
}

export async function inspectRecognitionImageBuffer(buffer: Buffer): Promise<RecognitionImageInspectResult> {
  try {
    const decoded = await decodeRecognitionOriginalForPresentation(buffer, "投稿照片");
    return { ok: true, width: decoded.width, height: decoded.height };
  } catch {
    try {
      const meta = await sharp(buffer, { failOn: "none" }).metadata();
      if (!meta.width || !meta.height) return { ok: false, code: "unreadable_image" };
      return { ok: true, width: meta.width, height: meta.height };
    } catch {
      return { ok: false, code: "corrupted_image" };
    }
  }
}

export async function inspectRecognitionStoragePhoto(
  storagePath: string | null | undefined,
): Promise<RecognitionImageInspectResult | null> {
  if (!storagePath?.trim()) return null;
  const parsed = parseRecognitionPhotoRef(storagePath);
  if (!parsed.ok || parsed.kind === "blob-url") {
    return { ok: false, code: "unreadable_image" };
  }
  if (parsed.kind !== "storage-path") {
    return { ok: false, code: "unreadable_image" };
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(RECOGNITION_PHOTOS_BUCKET)
    .download(parsed.storagePath);
  if (error || !data) {
    return { ok: false, code: "storage_object_missing" };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length === 0) return { ok: false, code: "storage_object_missing" };
  return inspectRecognitionImageBuffer(buffer);
}

async function loadEventAwardsMap(eventId: string) {
  const awards = await listEventAwards(eventId);
  return new Map(awards.map((award) => [award.id, award]));
}

async function loadEventEntries(eventId: string): Promise<RecognitionEntryRow[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_submission_entries")
    .select("*")
    .eq("event_id", eventId);
  if (error) throw new RecognitionServiceError(error.message, 500);
  return (data ?? []) as RecognitionEntryRow[];
}

function duplicateName(input: {
  entry: RecognitionEntryRow;
  others: RecognitionEntryRow[];
}): boolean {
  const name = normalizeRecognitionSubmittedName(input.entry.submitted_name);
  if (!name) return false;
  return input.others.some((other) => (
    other.id !== input.entry.id
    && other.event_award_id === input.entry.event_award_id
    && !other.excluded_at
    && other.validation_status !== "EXCLUDED"
    && normalizeRecognitionSubmittedName(other.submitted_name) === name
  ));
}

export async function evaluateStoredRecognitionEntry(input: {
  entry: RecognitionEntryRow;
  others: RecognitionEntryRow[];
  award: { eventAwardId: string; name: string; requiresPhoto: boolean } | null;
  imageInspect?: RecognitionImageInspectResult | null;
}): Promise<ReturnType<typeof evaluateRecognitionEntryValidation>> {
  const photoPath = recognitionAuthoritativePhotoPath({
    currentPhotoStoragePath: input.entry.current_photo_storage_path,
    originalPhotoStoragePath: input.entry.original_photo_storage_path,
  });
  let inspect = input.imageInspect ?? null;
  if (inspect === undefined || inspect === null) {
    if (input.award?.requiresPhoto && photoPath) {
      inspect = await inspectRecognitionStoragePhoto(photoPath);
    }
  }
  return evaluateRecognitionEntryValidation({
    submittedName: input.entry.submitted_name,
    award: input.award,
    photoStoragePath: photoPath,
    photoMimeType: input.entry.current_photo_mime_type ?? input.entry.original_photo_mime_type,
    imageInspect: inspect,
    crop: input.entry.confirmed_crop ?? null,
    confirmedWarnings: input.entry.submitter_confirmed_warnings ?? [],
    duplicateName: duplicateName({ entry: input.entry, others: input.others }),
    excluded: Boolean(input.entry.excluded_at) || input.entry.validation_status === "EXCLUDED",
    adminOverride: parseOverride(input.entry.admin_override_json),
  });
}

async function persistEntryValidation(input: {
  entryId: string;
  status: RecognitionValidationStatus;
  issues: RecognitionValidationIssue[];
  crop?: RecognitionNormalizedCrop | null;
  originalWidth?: number | null;
  originalHeight?: number | null;
  confirmedWarnings?: string[];
  currentPhoto?: {
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const patch: Record<string, unknown> = {
    validation_status: input.status,
    validation_issues: input.issues,
  };
  if (input.crop !== undefined) {
    patch.confirmed_crop = input.crop;
    patch.confirmed_crop_aspect = input.crop ? RECOGNITION_PRESENTATION_CROP_ASPECT.label : null;
    patch.crop_confirmed_at = input.crop ? new Date().toISOString() : null;
  }
  if (input.originalWidth !== undefined) patch.original_width = input.originalWidth;
  if (input.originalHeight !== undefined) patch.original_height = input.originalHeight;
  if (input.confirmedWarnings !== undefined) {
    patch.submitter_confirmed_warnings = input.confirmedWarnings;
  }
  if (input.currentPhoto) {
    patch.current_photo_storage_path = input.currentPhoto.storagePath;
    patch.current_photo_mime_type = input.currentPhoto.mimeType;
    patch.current_photo_size_bytes = input.currentPhoto.sizeBytes;
  }
  const { error } = await supabase
    .from("recognition_submission_entries")
    .update(patch)
    .eq("id", input.entryId);
  if (error) throw new RecognitionServiceError(error.message, 500);
}

async function autoPassEntryCandidate(input: {
  eventId: string;
  entry: RecognitionEntryRow;
  pptReady: boolean;
  excluded: boolean;
}): Promise<void> {
  await syncRecognitionEventCandidates(input.eventId);
  const candidates = await loadRecognitionCandidatesForEvent(input.eventId);
  const candidate = candidates.find((item) => (
    item.eventAwardId === input.entry.event_award_id
    && item.normalizedName === input.entry.normalized_name
  ));
  if (!candidate) return;

  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  if (input.excluded) {
    const otherReady = candidate.sources.some((source) => source.submissionEntryId !== input.entry.id);
    if (candidate.preferredSourceEntryId === input.entry.id || !otherReady) {
      await supabase
        .from("recognition_candidates")
        .update({
          review_status: "rejected",
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", candidate.id)
        .eq("event_id", input.eventId);
    }
    return;
  }

  if (!input.pptReady) {
    if (candidate.reviewStatus === "approved" && candidate.preferredSourceEntryId === input.entry.id) {
      await supabase
        .from("recognition_candidates")
        .update({
          review_status: "pending",
          updated_at: now,
        })
        .eq("id", candidate.id)
        .eq("event_id", input.eventId);
    }
    return;
  }

  const requiresPhoto = candidate.requiresPhoto;
  const photoPath = recognitionAuthoritativePhotoPath({
    currentPhotoStoragePath: input.entry.current_photo_storage_path,
    originalPhotoStoragePath: input.entry.original_photo_storage_path,
  });
  const nextPreferred = requiresPhoto && photoPath
    ? input.entry.id
    : candidate.preferredSourceEntryId;

  if (requiresPhoto && nextPreferred && candidate.preferredSourceEntryId !== nextPreferred) {
    const { error: preferredError } = await supabase
      .from("recognition_candidates")
      .update({
        preferred_source_entry_id: nextPreferred,
        updated_at: now,
      })
      .eq("id", candidate.id)
      .eq("event_id", input.eventId);
    if (preferredError) throw new RecognitionServiceError(preferredError.message, 500);
  }

  if (requiresPhoto && photoPath) {
    const width = input.entry.original_width ?? 1200;
    const height = input.entry.original_height ?? 1600;
    const crop = input.entry.confirmed_crop
      && validateRecognitionNormalizedCrop(input.entry.confirmed_crop) === null
      ? input.entry.confirmed_crop
      : defaultRecognitionCoverCrop({ originalWidth: width, originalHeight: height });
    const flags = (input.entry.submitter_confirmed_warnings ?? []).includes("multi_person")
      ? ["group_photo"]
      : [];
    const { error: cropError } = await supabase.rpc("upsert_recognition_candidate_photo_review", {
      p_candidate_id: candidate.id,
      p_source_entry_id: input.entry.id,
      p_crop_x: crop.x,
      p_crop_y: crop.y,
      p_crop_width: crop.width,
      p_crop_height: crop.height,
      p_crop_aspect_ratio: RECOGNITION_PRESENTATION_CROP_ASPECT.label,
      p_original_width: width,
      p_original_height: height,
      p_flags: flags,
      p_is_blocked: false,
      p_blocked_reason: null,
      p_finalize: true,
      p_admin_member_id: null,
    });
    if (cropError) throw new RecognitionServiceError(cropError.message, 500);
  }

  const { error: approveError } = await supabase
    .from("recognition_candidates")
    .update({
      review_status: "approved",
      preferred_source_entry_id: requiresPhoto ? (nextPreferred ?? input.entry.id) : candidate.preferredSourceEntryId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .eq("event_id", input.eventId);
  if (approveError) throw new RecognitionServiceError(approveError.message, 500);
}

export async function applyRecognitionEntrySelfService(input: {
  eventId: string;
  entryId: string;
  imageInspect?: RecognitionImageInspectResult | null;
  crop?: RecognitionNormalizedCrop | null;
  originalWidth?: number | null;
  originalHeight?: number | null;
  confirmedWarnings?: string[];
  currentPhoto?: {
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
}): Promise<{
  status: RecognitionValidationStatus;
  issues: RecognitionValidationIssue[];
  pptReady: boolean;
  completionHint: RecognitionEntryRow;
}> {
  const awards = await loadEventAwardsMap(input.eventId);
  const entries = await loadEventEntries(input.eventId);
  const entry = entries.find((item) => item.id === input.entryId);
  if (!entry) throw new RecognitionServiceError("Entry not found.", 404);

  if (input.crop !== undefined) entry.confirmed_crop = input.crop;
  if (input.originalWidth !== undefined) entry.original_width = input.originalWidth;
  if (input.originalHeight !== undefined) entry.original_height = input.originalHeight;
  if (input.confirmedWarnings !== undefined) entry.submitter_confirmed_warnings = input.confirmedWarnings;
  if (input.currentPhoto) {
    entry.current_photo_storage_path = input.currentPhoto.storagePath;
    entry.current_photo_mime_type = input.currentPhoto.mimeType;
    entry.current_photo_size_bytes = input.currentPhoto.sizeBytes;
  }

  const award = awards.get(entry.event_award_id) ?? null;
  const result = await evaluateStoredRecognitionEntry({
    entry,
    others: entries,
    award: award
      ? { eventAwardId: award.id, name: award.awardName ?? "", requiresPhoto: Boolean(award.requiresPhoto) }
      : null,
    imageInspect: input.imageInspect,
  });

  await persistEntryValidation({
    entryId: entry.id,
    status: result.status,
    issues: result.issues,
    crop: input.crop,
    originalWidth: input.originalWidth,
    originalHeight: input.originalHeight,
    confirmedWarnings: input.confirmedWarnings,
    currentPhoto: input.currentPhoto,
  });

  const refreshed: RecognitionEntryRow = {
    ...entry,
    validation_status: result.status,
    validation_issues: result.issues,
  };
  await autoPassEntryCandidate({
    eventId: input.eventId,
    entry: refreshed,
    pptReady: result.pptReady,
    excluded: result.status === "EXCLUDED",
  });

  return {
    status: result.status,
    issues: result.issues,
    pptReady: result.pptReady,
    completionHint: refreshed,
  };
}

export async function applyRecognitionSubmissionSelfService(input: {
  eventId: string;
  submissionId: string;
  inspectByEntryId?: Record<string, RecognitionImageInspectResult | null>;
  cropByEntryId?: Record<string, RecognitionNormalizedCrop | null>;
  confirmedWarningsByEntryId?: Record<string, string[]>;
  dimensionsByEntryId?: Record<string, { width: number; height: number }>;
}): Promise<{
  entries: Array<{
    entryId: string;
    submittedName: string;
    awardName: string;
    status: RecognitionValidationStatus;
    issues: RecognitionValidationIssue[];
    pptReady: boolean;
  }>;
  completion: RecognitionSubmissionCompletion;
}> {
  const awards = await loadEventAwardsMap(input.eventId);
  const allEntries = await loadEventEntries(input.eventId);
  const submissionEntries = allEntries.filter((entry) => entry.submission_id === input.submissionId);
  const views = [];

  for (const entry of submissionEntries) {
    const dims = input.dimensionsByEntryId?.[entry.id];
    const crop = input.cropByEntryId?.[entry.id];
    const warnings = input.confirmedWarningsByEntryId?.[entry.id];
    const inspect = input.inspectByEntryId?.[entry.id];
    const applied = await applyRecognitionEntrySelfService({
      eventId: input.eventId,
      entryId: entry.id,
      imageInspect: inspect,
      crop: crop ?? (dims ? defaultRecognitionCoverCrop({
        originalWidth: dims.width,
        originalHeight: dims.height,
      }) : undefined),
      originalWidth: dims?.width,
      originalHeight: dims?.height,
      confirmedWarnings: warnings,
    });
    const award = awards.get(entry.event_award_id);
    views.push({
      entryId: entry.id,
      submittedName: entry.submitted_name,
      awardName: award?.awardName ?? "",
      status: applied.status,
      issues: applied.issues,
      pptReady: applied.pptReady,
    });
  }

  return {
    entries: views,
    completion: summarizeRecognitionSubmissionCompletion(views),
  };
}

export async function getRecognitionEventDashboard(eventId: string): Promise<RecognitionEventDashboard> {
  const event = await getRecognitionEvent(eventId);
  if (!event) throw new RecognitionServiceError("Event not found.", 404);
  const awards = await loadEventAwardsMap(eventId);
  const entries = await loadEventEntries(eventId);
  const supabase = createSupabaseServiceClient();
  const { data: submissions, error } = await supabase
    .from("recognition_submissions")
    .select("id")
    .eq("event_id", eventId);
  if (error) throw new RecognitionServiceError(error.message, 500);

  const evaluations: RecognitionEventDashboardCountInput[] = [];
  for (const entry of entries) {
    const award = awards.get(entry.event_award_id);
    const result = await evaluateStoredRecognitionEntry({
      entry,
      others: entries,
      award: award
        ? { eventAwardId: award.id, name: award.awardName ?? "", requiresPhoto: Boolean(award.requiresPhoto) }
        : null,
      imageInspect: entry.original_width && entry.original_height
        ? { ok: true, width: entry.original_width, height: entry.original_height }
        : undefined,
    });
    evaluations.push({
      ...result,
      eventAwardId: entry.event_award_id,
    });
  }

  const counts = aggregateRecognitionEventDashboardCounts(evaluations);

  return {
    eventId: event.id,
    eventName: event.name,
    year: event.year,
    month: event.month,
    collectEndsAt: event.collectEndsAt,
    status: event.status,
    totalEntries: entries.length,
    totalSubmitters: (submissions ?? []).length,
    ...counts,
  };
}

export async function listRecognitionExceptions(eventId: string): Promise<RecognitionExceptionItem[]> {
  const event = await getRecognitionEvent(eventId);
  if (!event) throw new RecognitionServiceError("Event not found.", 404);
  const awards = await loadEventAwardsMap(eventId);
  const entries = await loadEventEntries(eventId);
  const supabase = createSupabaseServiceClient();
  const { data: submissions, error } = await supabase
    .from("recognition_submissions")
    .select("id, submitter_name, submitted_at")
    .eq("event_id", eventId);
  if (error) throw new RecognitionServiceError(error.message, 500);
  const submissionMap = new Map(
    (submissions ?? []).map((row) => [row.id as string, row as { submitter_name: string; submitted_at: string }]),
  );

  const items: RecognitionExceptionItem[] = [];
  for (const entry of entries) {
    const award = awards.get(entry.event_award_id);
    const result = await evaluateStoredRecognitionEntry({
      entry,
      others: entries,
      award: award
        ? { eventAwardId: award.id, name: award.awardName ?? "", requiresPhoto: Boolean(award.requiresPhoto) }
        : null,
      imageInspect: entry.original_width && entry.original_height
        ? { ok: true, width: entry.original_width, height: entry.original_height }
        : undefined,
    });
    if (!result.exception && result.status !== "BLOCKED") continue;
    const submission = submissionMap.get(entry.submission_id);
    items.push({
      entryId: entry.id,
      submissionId: entry.submission_id,
      eventAwardId: entry.event_award_id,
      awardName: award?.awardName ?? "",
      requiresPhoto: Boolean(award?.requiresPhoto),
      submittedName: entry.submitted_name,
      submitterName: submission?.submitter_name ?? "",
      validationStatus: result.status,
      issues: result.issues,
      hasTechnicalBlocker: result.hasTechnicalBlocker,
      canAdminOverride: result.canAdminOverride,
      hasOriginalPhoto: Boolean(entry.original_photo_storage_path),
      hasCurrentPhoto: Boolean(recognitionAuthoritativePhotoPath({
        currentPhotoStoragePath: entry.current_photo_storage_path,
        originalPhotoStoragePath: entry.original_photo_storage_path,
      })),
      hasConfirmedCrop: Boolean(entry.confirmed_crop),
      submittedAt: submission?.submitted_at ?? entry.created_at,
    });
  }
  return items;
}

export async function adminOverrideRecognitionEntry(input: {
  eventId: string;
  entryId: string;
  adminMemberId: string;
  reason?: string | null;
}): Promise<{ status: RecognitionValidationStatus }> {
  const awards = await loadEventAwardsMap(input.eventId);
  const entries = await loadEventEntries(input.eventId);
  const entry = entries.find((item) => item.id === input.entryId);
  if (!entry) throw new RecognitionServiceError("Entry not found.", 404);
  const award = awards.get(entry.event_award_id) ?? null;
  const current = await evaluateStoredRecognitionEntry({
    entry,
    others: entries,
    award: award
      ? { eventAwardId: award.id, name: award.awardName ?? "", requiresPhoto: Boolean(award.requiresPhoto) }
      : null,
  });
  if (current.hasTechnicalBlocker || !current.canAdminOverride) {
    throw new RecognitionServiceError("此筆有技術問題，無法強制通過。請修正照片，或取消此筆表揚。", 409);
  }

  const audit: RecognitionAdminOverrideAudit = {
    originalStatus: current.status,
    originalIssues: current.issues,
    overriddenBy: input.adminMemberId,
    overriddenAt: new Date().toISOString(),
    reason: input.reason?.trim() || null,
  };
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("recognition_submission_entries")
    .update({
      admin_override_json: audit,
      validation_status: "ADMIN_OVERRIDE",
      validation_issues: current.issues,
    })
    .eq("id", input.entryId);
  if (error) throw new RecognitionServiceError(error.message, 500);

  entry.admin_override_json = audit;
  const applied = await applyRecognitionEntrySelfService({
    eventId: input.eventId,
    entryId: input.entryId,
  });
  return { status: applied.status };
}

export async function adminExcludeRecognitionEntry(input: {
  eventId: string;
  entryId: string;
  adminMemberId: string;
  reason?: string | null;
}): Promise<{ status: RecognitionValidationStatus }> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("recognition_submission_entries")
    .update({
      excluded_at: new Date().toISOString(),
      excluded_by_member_id: input.adminMemberId,
      excluded_reason: input.reason?.trim() || null,
      validation_status: "EXCLUDED",
    })
    .eq("id", input.entryId);
  if (error) throw new RecognitionServiceError(error.message, 500);
  const applied = await applyRecognitionEntrySelfService({
    eventId: input.eventId,
    entryId: input.entryId,
  });
  return { status: applied.status };
}

export { isRecognitionPptReadyStatus };
