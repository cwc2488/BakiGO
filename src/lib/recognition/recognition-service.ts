/**
 * Recognition Center service layer.
 *
 * All mutations require the caller to pass a verified member id;
 * this module trusts that the API route layer has authenticated the user
 * and will separately check Recognition Admin membership.
 *
 * All DB access uses the service role client (no anon/authenticated RLS policies exist).
 */

import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  assertRecognitionStatusTransition,
  generateRecognitionPublicToken,
  hashRecognitionPublicToken,
  resolveRecognitionCollectionState,
  toCreateRecognitionEventRpcArgs,
  toRecognitionSubmissionRpcEntries,
  validateRecognitionAwardReorderInput,
  validateRecognitionEventInput,
  validateRecognitionPublicSubmissionAgainstAwards,
  validateRecognitionPublicTextField,
} from "@/lib/recognition/recognition-domain";
import type {
  RecognitionAwardDefinition,
  RecognitionEvent,
  RecognitionEventAward,
  RecognitionEventSummary,
  RecognitionPublicEvent,
  RecognitionRawSubmissionView,
  RecognitionSubmission,
  RecognitionSubmissionCreateEntry,
  RecognitionSubmissionEntry,
  RecognitionEventCreateInput,
  RecognitionEventUpdateInput,
  RecognitionLayoutHint,
} from "@/types/recognition";

export class RecognitionServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "RecognitionServiceError";
  }
}

export function humanizeRecognitionDatabaseError(message: string): string {
  const text = message.trim();
  const missingSchema = /schema cache|does not exist|PGRST205|PGRST202/i.test(text);
  if (missingSchema && /recognition_events/i.test(text)) {
    return "表揚中心資料表尚未套用到資料庫。請在 Supabase SQL Editor 依序執行 supabase/migrations/035_recognition_foundation.sql 到 044_recognition_delete_event.sql。";
  }
  if (missingSchema && /create_recognition_event_with_awards/i.test(text)) {
    return "表揚中心建立活動函式尚未套用到資料庫。請在 Supabase SQL Editor 執行 supabase/migrations/036_recognition_event_rpcs.sql（需先完成 035）。";
  }
  if (missingSchema && /delete_recognition_event/i.test(text)) {
    return "表揚中心刪除活動函式尚未套用到資料庫。請在 Supabase SQL Editor 執行 supabase/migrations/044_recognition_delete_event.sql。";
  }
  if (missingSchema && /recognition_/i.test(text)) {
    return "表揚中心資料庫尚未完整套用。請在 Supabase SQL Editor 依序執行 supabase/migrations/035 到 044，不要略過中間檔案。";
  }
  return text;
}

function throwRecognitionDatabaseError(message: string, fallback: string, status = 500): never {
  throw new RecognitionServiceError(humanizeRecognitionDatabaseError(message || fallback), status);
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

type AwardDefinitionRow = {
  id: string;
  slug: string;
  name: string;
  requires_photo: boolean;
  layout_hint: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  name: string;
  year: number;
  month: number;
  collect_starts_at: string | null;
  collect_ends_at: string | null;
  status: string;
  ppt_theme_id: string | null;
  event_template_id: string | null;
  copied_from_event_id: string | null;
  created_by_member_id: string | null;
  closed_at: string | null;
  public_collection_token: string | null;
  public_collection_token_hash: string | null;
  public_collection_token_rotated_at: string | null;
  created_at: string;
  updated_at: string;
};

type EventAwardRow = {
  id: string;
  event_id: string;
  award_definition_id: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  recognition_award_definitions?: AwardDefinitionRow | null;
};

type PublicEventAwardRow = {
  id: string;
  award_definition_id: string;
  sort_order: number;
  is_enabled: boolean;
  recognition_award_definitions?: AwardDefinitionRow | AwardDefinitionRow[] | null;
};

type SubmissionRow = {
  id: string;
  event_id: string;
  submitter_name: string;
  submitter_organization: string;
  submitted_at: string;
  created_at: string;
  public_edit_token?: string | null;
};

type SubmissionEntryRow = {
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
  validation_status?: string | null;
  submitter_confirmed_warnings?: string[] | null;
  current_photo_storage_path?: string | null;
  confirmed_crop?: unknown;
  original_width?: number | null;
  original_height?: number | null;
  recognition_event_awards?: {
    recognition_award_definitions?: AwardDefinitionRow | null;
  } | null;
};

function mapAwardDefinition(row: AwardDefinitionRow): RecognitionAwardDefinition {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    requiresPhoto: row.requires_photo,
    layoutHint: row.layout_hint as RecognitionLayoutHint,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): RecognitionEvent {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    month: row.month,
    collectStartsAt: row.collect_starts_at,
    collectEndsAt: row.collect_ends_at,
    status: row.status as RecognitionEvent["status"],
    pptThemeId: row.ppt_theme_id,
    eventTemplateId: row.event_template_id,
    copiedFromEventId: row.copied_from_event_id,
    createdByMemberId: row.created_by_member_id,
    closedAt: row.closed_at,
    publicCollectionToken: row.public_collection_token,
    publicCollectionTokenHash: row.public_collection_token_hash,
    publicCollectionTokenRotatedAt: row.public_collection_token_rotated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventAward(row: EventAwardRow): RecognitionEventAward {
  const def = row.recognition_award_definitions;
  return {
    id: row.id,
    eventId: row.event_id,
    awardDefinitionId: row.award_definition_id,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    awardSlug: def?.slug,
    awardName: def?.name,
    requiresPhoto: def?.requires_photo,
    layoutHint: def?.layout_hint as RecognitionLayoutHint | undefined,
  };
}

function mapSubmission(row: SubmissionRow): RecognitionSubmission {
  return {
    id: row.id,
    eventId: row.event_id,
    submitterName: row.submitter_name,
    submitterOrganization: row.submitter_organization,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    publicEditToken: row.public_edit_token ?? null,
  };
}

function mapSubmissionEntry(row: SubmissionEntryRow): RecognitionSubmissionEntry {
  return {
    id: row.id,
    submissionId: row.submission_id,
    eventId: row.event_id,
    eventAwardId: row.event_award_id,
    submittedName: row.submitted_name,
    normalizedName: row.normalized_name,
    originalPhotoStoragePath: row.original_photo_storage_path,
    originalPhotoMimeType: row.original_photo_mime_type,
    originalPhotoSizeBytes: row.original_photo_size_bytes,
    createdAt: row.created_at,
    validationStatus: (row.validation_status as RecognitionSubmissionEntry["validationStatus"]) ?? undefined,
    submitterConfirmedWarnings: row.submitter_confirmed_warnings ?? [],
    currentPhotoStoragePath: row.current_photo_storage_path ?? null,
    confirmedCrop: (row.confirmed_crop as RecognitionSubmissionEntry["confirmedCrop"]) ?? null,
    originalWidth: row.original_width ?? null,
    originalHeight: row.original_height ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recognition Admin access
// ---------------------------------------------------------------------------

export async function isRecognitionAdmin(memberId: string): Promise<boolean> {
  try {
    return await resolveIsSuperAdmin(memberId);
  } catch (error) {
    throw new RecognitionServiceError(
      error instanceof Error ? error.message : "Failed to resolve Super Admin access.",
      500,
    );
  }
}

export async function assertRecognitionAdmin(memberId: string): Promise<void> {
  const admin = await isRecognitionAdmin(memberId);
  if (!admin) {
    throw new RecognitionServiceError("Recognition Admin access required.", 403);
  }
}

// ---------------------------------------------------------------------------
// Award definitions catalog
// ---------------------------------------------------------------------------

export async function listAwardDefinitions(opts?: {
  includeInactive?: boolean;
}): Promise<RecognitionAwardDefinition[]> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("recognition_award_definitions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (!opts?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  return (data ?? []).map((r) => mapAwardDefinition(r as AwardDefinitionRow));
}

// ---------------------------------------------------------------------------
// Recognition Events
// ---------------------------------------------------------------------------

export async function listRecognitionEvents(): Promise<RecognitionEvent[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_events")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throwRecognitionDatabaseError(error.message, "Failed to load events.");
  }
  return (data ?? []).map((r) => mapEvent(r as EventRow));
}

export async function listRecognitionEventSummaries(filter?: {
  year?: number;
  month?: number;
}): Promise<RecognitionEventSummary[]> {
  const events = (await listRecognitionEvents()).filter((event) => {
    if (filter?.year !== undefined && event.year !== filter.year) return false;
    if (filter?.month !== undefined && event.month !== filter.month) return false;
    return true;
  });
  if (events.length === 0) return [];

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_candidates")
    .select("event_id, review_status")
    .in("event_id", events.map((event) => event.id));

  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }

  const { data: validationData } = await supabase
    .from("recognition_submission_entries")
    .select("event_id, validation_status")
    .in("event_id", events.map((event) => event.id));

  const validationCounts = new Map<string, { pptReady: number; blocked: number }>();
  for (const event of events) {
    validationCounts.set(event.id, { pptReady: 0, blocked: 0 });
  }
  for (const row of validationData ?? []) {
    const typed = row as { event_id: string; validation_status: string | null };
    const bucket = validationCounts.get(typed.event_id);
    if (!bucket) continue;
    if (typed.validation_status === "BLOCKED") bucket.blocked += 1;
    if (
      typed.validation_status === "PASS"
      || typed.validation_status === "WARNING"
      || typed.validation_status === "ADMIN_OVERRIDE"
    ) {
      bucket.pptReady += 1;
    }
  }

  const counts = new Map<string, { approved: number; pending: number; needsFix: number; rejected: number }>();
  for (const event of events) {
    counts.set(event.id, { approved: 0, pending: 0, needsFix: 0, rejected: 0 });
  }
  for (const row of data ?? []) {
    const typed = row as { event_id: string; review_status: string };
    const bucket = counts.get(typed.event_id);
    if (!bucket) continue;
    if (typed.review_status === "approved") bucket.approved += 1;
    else if (typed.review_status === "pending") bucket.pending += 1;
    else if (typed.review_status === "needs_fix") bucket.needsFix += 1;
    else if (typed.review_status === "rejected") bucket.rejected += 1;
  }

  return events.map((event) => {
    const bucket = counts.get(event.id) ?? { approved: 0, pending: 0, needsFix: 0, rejected: 0 };
    const validation = validationCounts.get(event.id) ?? { pptReady: 0, blocked: 0 };
    return {
      ...event,
      approvedCount: bucket.approved,
      pendingCount: bucket.pending,
      needsFixCount: bucket.needsFix,
      rejectedCount: bucket.rejected,
      problemCount: validation.blocked || (bucket.pending + bucket.needsFix),
      pptReadyCount: validation.pptReady || bucket.approved,
      exceptionCount: validation.blocked,
    };
  });
}

export async function getRecognitionEvent(eventId: string): Promise<RecognitionEvent | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throwRecognitionDatabaseError(error.message, "Failed to load event.");
  }
  if (!data) return null;
  return mapEvent(data as EventRow);
}

/**
 * Create a new Recognition Event and populate its award configuration
 * from the active catalog. If copiedFromEventId is provided, the award
 * enable/disable state and ordering is copied from that event.
 */
export async function createRecognitionEvent(
  input: RecognitionEventCreateInput,
): Promise<RecognitionEvent> {
  const validationError = validateRecognitionEventInput(input);
  if (validationError) {
    throw new RecognitionServiceError(validationError, 400);
  }

  const supabase = createSupabaseServiceClient();
  const { data: eventData, error: rpcError } = await supabase.rpc(
    "create_recognition_event_with_awards",
    toCreateRecognitionEventRpcArgs(input),
  );

  if (rpcError || !eventData) {
    throwRecognitionDatabaseError(rpcError?.message ?? "Failed to create event.", "Failed to create event.");
  }

  return mapEvent(eventData as EventRow);
}

export async function deleteRecognitionEvent(eventId: string): Promise<{ eventId: string }> {
  const existing = await getRecognitionEvent(eventId);
  if (!existing) {
    throw new RecognitionServiceError("找不到這個表揚活動。", 404);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("delete_recognition_event", {
    p_event_id: eventId,
  });

  if (error) {
    throwRecognitionDatabaseError(error.message, "Failed to delete event.");
  }

  const payload = data as { ok?: boolean; eventId?: string } | null;
  if (!payload?.ok) {
    throw new RecognitionServiceError("刪除表揚活動失敗，請稍後再試。", 500);
  }

  return { eventId: payload.eventId ?? eventId };
}

export async function updateRecognitionEvent(
  eventId: string,
  input: RecognitionEventUpdateInput,
): Promise<RecognitionEvent> {
  const validationError = validateRecognitionEventInput(input);
  if (validationError) {
    throw new RecognitionServiceError(validationError, 400);
  }

  // Validate status transitions
  if (input.status) {
    const existing = await getRecognitionEvent(eventId);
    if (!existing) {
      throw new RecognitionServiceError("Event not found.", 404);
    }
    const transitionError = assertRecognitionStatusTransition(existing.status, input.status);
    if (transitionError) {
      throw new RecognitionServiceError(transitionError, 400);
    }
  }

  const supabase = createSupabaseServiceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.year !== undefined) patch.year = input.year;
  if (input.month !== undefined) patch.month = input.month;
  if ("collectStartsAt" in input) patch.collect_starts_at = input.collectStartsAt;
  if ("collectEndsAt" in input) patch.collect_ends_at = input.collectEndsAt;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "closed") {
      patch.closed_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("recognition_events")
    .update(patch)
    .eq("id", eventId)
    .select("*")
    .single();

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to update event.", 500);
  }
  return mapEvent(data as EventRow);
}

export async function rotateRecognitionPublicToken(eventId: string): Promise<RecognitionEvent> {
  const supabase = createSupabaseServiceClient();
  const token = generateRecognitionPublicToken();
  const tokenHash = hashRecognitionPublicToken(token);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("recognition_events")
    .update({
      public_collection_token: token,
      public_collection_token_hash: tokenHash,
      public_collection_token_rotated_at: now,
      updated_at: now,
    })
    .eq("id", eventId)
    .select("*")
    .single();

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to rotate public token.", 500);
  }
  return mapEvent(data as EventRow);
}

export async function resolveRecognitionPublicEventByToken(
  token: string,
): Promise<{ state: ReturnType<typeof resolveRecognitionCollectionState>; event: RecognitionPublicEvent | null }> {
  const tokenHash = hashRecognitionPublicToken(token);
  const supabase = createSupabaseServiceClient();

  const { data: eventData, error: eventError } = await supabase
    .from("recognition_events")
    .select("*")
    .eq("public_collection_token_hash", tokenHash)
    .maybeSingle();

  if (eventError) {
    throw new RecognitionServiceError(eventError.message, 500);
  }
  if (!eventData) {
    return { state: "invalid", event: null };
  }

  const event = mapEvent(eventData as EventRow);
  const state = resolveRecognitionCollectionState({
    exists: true,
    status: event.status,
    collectStartsAt: event.collectStartsAt,
    collectEndsAt: event.collectEndsAt,
  });

  const { data: awardsData, error: awardsError } = await supabase
    .from("recognition_event_awards")
    .select("id, award_definition_id, sort_order, is_enabled, recognition_award_definitions(*)")
    .eq("event_id", event.id)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (awardsError) {
    throw new RecognitionServiceError(awardsError.message, 500);
  }

  const awards = (awardsData ?? []).map((row) => {
    const typed = row as PublicEventAwardRow;
    const definition = Array.isArray(typed.recognition_award_definitions)
      ? typed.recognition_award_definitions[0]
      : typed.recognition_award_definitions;
    return {
      eventAwardId: typed.id,
      awardDefinitionId: typed.award_definition_id,
      slug: definition?.slug ?? "",
      name: definition?.name ?? "",
      requiresPhoto: definition?.requires_photo ?? false,
      sortOrder: typed.sort_order,
    };
  });

  return {
    state,
    event: {
      eventId: event.id,
      name: event.name,
      year: event.year,
      month: event.month,
      collectEndsAt: event.collectEndsAt,
      awards,
    },
  };
}

export async function createPublicRecognitionSubmission(input: {
  token: string;
  submissionId: string;
  submitterName: string;
  submitterOrganization: string;
  sourceContext: Record<string, unknown>;
  entries: RecognitionSubmissionCreateEntry[];
}): Promise<RecognitionSubmission> {
  const prepared = await prepareRecognitionPublicSubmissionContext({
    token: input.token,
    submitterName: input.submitterName,
    submitterOrganization: input.submitterOrganization,
    entries: input.entries.map((entry) => ({
      submittedName: entry.submittedName,
      eventAwardId: entry.eventAwardId,
      hasPhoto: Boolean(entry.originalPhotoStoragePath),
    })),
  });

  return finalizeRecognitionPublicSubmission({
    eventId: prepared.event.eventId,
    submissionId: input.submissionId,
    submitterName: input.submitterName,
    submitterOrganization: input.submitterOrganization,
    sourceContext: input.sourceContext,
    entries: input.entries,
  });
}

export async function prepareRecognitionPublicSubmissionContext(input: {
  token: string;
  submitterName: string;
  submitterOrganization: string;
  entries: Array<{
    submittedName: string;
    eventAwardId: string;
    hasPhoto: boolean;
  }>;
}): Promise<{ event: RecognitionPublicEvent }> {
  const eventResolution = await resolveRecognitionPublicEventByToken(input.token);
  if (eventResolution.state !== "open" || !eventResolution.event) {
    const messageMap: Record<typeof eventResolution.state, string> = {
      invalid: "連結無效或已失效。",
      not_started: "收件尚未開始。",
      closed: "收件已關閉。",
      expired: "收件已過期。",
      open: "ok",
    };
    throw new RecognitionServiceError(messageMap[eventResolution.state], 403);
  }

  const nameError = validateRecognitionPublicTextField(
    input.submitterName,
    100,
    "填報者姓名",
  );
  if (nameError) throw new RecognitionServiceError(nameError, 400);

  const orgValue = input.submitterOrganization?.trim() ?? "";
  if (orgValue) {
    const orgError = validateRecognitionPublicTextField(
      orgValue,
      120,
      "組織名稱",
    );
    if (orgError) throw new RecognitionServiceError(orgError, 400);
  }

  const submissionError = validateRecognitionPublicSubmissionAgainstAwards({
    entries: input.entries.map((entry) => ({
      submittedName: entry.submittedName,
      eventAwardId: entry.eventAwardId,
      originalPhotoStoragePath: entry.hasPhoto ? "__present__" : null,
    })),
    awards: eventResolution.event.awards,
  });
  if (submissionError) {
    throw new RecognitionServiceError(submissionError, 400);
  }

  return { event: eventResolution.event };
}

export async function finalizeRecognitionPublicSubmission(input: {
  eventId: string;
  submissionId: string;
  submitterName: string;
  submitterOrganization: string;
  sourceContext: Record<string, unknown>;
  entries: RecognitionSubmissionCreateEntry[];
}): Promise<RecognitionSubmission> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("create_public_recognition_submission", {
    p_submission_id: input.submissionId,
    p_event_id: input.eventId,
    p_submitter_name: input.submitterName.trim(),
    p_submitter_organization: (input.submitterOrganization ?? "").trim(),
    p_submitted_at: new Date().toISOString(),
    p_source_context_json: input.sourceContext,
    p_entries: toRecognitionSubmissionRpcEntries(input.entries),
  });

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to save submission.", 500);
  }
  return mapSubmission(data as SubmissionRow);
}

export async function attachRecognitionPublicEditToken(submissionId: string): Promise<string> {
  const token = generateRecognitionPublicToken();
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("recognition_submissions")
    .update({
      public_edit_token: token,
      public_edit_token_hash: hashRecognitionPublicToken(token),
    })
    .eq("id", submissionId);
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  return token;
}

export async function getRecognitionPublicSubmissionByEditToken(input: {
  eventId: string;
  editToken: string;
}): Promise<{ submission: RecognitionSubmission; entries: RecognitionSubmissionEntry[] } | null> {
  const hash = hashRecognitionPublicToken(input.editToken);
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_submissions")
    .select("*")
    .eq("event_id", input.eventId)
    .eq("public_edit_token_hash", hash)
    .maybeSingle();
  if (error) throw new RecognitionServiceError(error.message, 500);
  if (!data) return null;
  const submission = mapSubmission({
    ...(data as SubmissionRow),
    public_edit_token: input.editToken,
  });
  const { data: entryData, error: entryError } = await supabase
    .from("recognition_submission_entries")
    .select("*")
    .eq("submission_id", submission.id)
    .order("created_at", { ascending: true });
  if (entryError) throw new RecognitionServiceError(entryError.message, 500);
  return {
    submission,
    entries: ((entryData ?? []) as SubmissionEntryRow[]).map(mapSubmissionEntry),
  };
}

export async function listRecognitionRawSubmissions(eventId: string): Promise<RecognitionRawSubmissionView[]> {
  const supabase = createSupabaseServiceClient();
  const { data: submissionsData, error: submissionsError } = await supabase
    .from("recognition_submissions")
    .select("*")
    .eq("event_id", eventId)
    .order("submitted_at", { ascending: false });

  if (submissionsError) {
    throw new RecognitionServiceError(submissionsError.message, 500);
  }

  const { data: entriesData, error: entriesError } = await supabase
    .from("recognition_submission_entries")
    .select("*, recognition_event_awards(recognition_award_definitions(*))")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (entriesError) {
    throw new RecognitionServiceError(entriesError.message, 500);
  }

  const entriesBySubmission = new Map<string, RecognitionRawSubmissionView["entries"]>();
  for (const row of (entriesData ?? []) as SubmissionEntryRow[]) {
    const base = mapSubmissionEntry(row);
    const entries = entriesBySubmission.get(base.submissionId) ?? [];
    entries.push({
      ...base,
      awardName: row.recognition_event_awards?.recognition_award_definitions?.name ?? "",
      requiresPhoto: row.recognition_event_awards?.recognition_award_definitions?.requires_photo ?? false,
      hasOriginalPhoto: Boolean(base.originalPhotoStoragePath),
    });
    entriesBySubmission.set(base.submissionId, entries);
  }

  return (submissionsData ?? []).map((row) => {
    const submission = mapSubmission(row as SubmissionRow);
    return {
      submission,
      entries: entriesBySubmission.get(submission.id) ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Event awards
// ---------------------------------------------------------------------------

export async function listEventAwards(eventId: string): Promise<RecognitionEventAward[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_event_awards")
    .select("*, recognition_award_definitions(*)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  return (data ?? []).map((r) => mapEventAward(r as EventAwardRow));
}

export async function updateEventAward(
  eventId: string,
  awardId: string,
  input: { isEnabled?: boolean; sortOrder?: number },
): Promise<RecognitionEventAward> {
  const supabase = createSupabaseServiceClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.isEnabled !== undefined) patch.is_enabled = input.isEnabled;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await supabase
    .from("recognition_event_awards")
    .update(patch)
    .eq("id", awardId)
    .eq("event_id", eventId)
    .select("*, recognition_award_definitions(*)")
    .single();

  if (error || !data) {
    throw new RecognitionServiceError(error?.message ?? "Failed to update event award.", 500);
  }
  return mapEventAward(data as EventAwardRow);
}

/**
 * Reorder event awards. Accepts ordered list of award ids and updates sort_order.
 */
export async function reorderEventAwards(
  eventId: string,
  orderedAwardIds: string[],
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const currentAwards = await listEventAwards(eventId);
  const validationError = validateRecognitionAwardReorderInput(
    orderedAwardIds,
    currentAwards.map((award) => award.id),
  );
  if (validationError) {
    throw new RecognitionServiceError(validationError, 400);
  }

  const { error } = await supabase.rpc("reorder_recognition_event_awards", {
    p_event_id: eventId,
    p_award_ids: orderedAwardIds,
  });
  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
}
