/**
 * Recognition Center service layer.
 *
 * All mutations require the caller to pass a verified member id;
 * this module trusts that the API route layer has authenticated the user
 * and will separately check Recognition Admin membership.
 *
 * All DB access uses the service role client (no anon/authenticated RLS policies exist).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  RecognitionAwardDefinition,
  RecognitionEvent,
  RecognitionEventAward,
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

// ---------------------------------------------------------------------------
// Recognition Admin access
// ---------------------------------------------------------------------------

export async function isRecognitionAdmin(memberId: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_admin_members")
    .select("member_id")
    .eq("member_id", memberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  return data !== null;
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
    throw new RecognitionServiceError(error.message, 500);
  }
  return (data ?? []).map((r) => mapEvent(r as EventRow));
}

export async function getRecognitionEvent(eventId: string): Promise<RecognitionEvent | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recognition_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new RecognitionServiceError(error.message, 500);
  }
  if (!data) return null;
  return mapEvent(data as EventRow);
}

function validateEventInput(input: { year?: number; month?: number; collectStartsAt?: string | null; collectEndsAt?: string | null }): void {
  if (input.year !== undefined && (input.year < 2000 || input.year > 2100)) {
    throw new RecognitionServiceError("year must be between 2000 and 2100.", 400);
  }
  if (input.month !== undefined && (input.month < 1 || input.month > 12)) {
    throw new RecognitionServiceError("month must be between 1 and 12.", 400);
  }
  if (input.collectStartsAt && input.collectEndsAt) {
    const start = new Date(input.collectStartsAt).getTime();
    const end = new Date(input.collectEndsAt).getTime();
    if (end < start) {
      throw new RecognitionServiceError("collect_ends_at cannot be before collect_starts_at.", 400);
    }
  }
}

/**
 * Create a new Recognition Event and populate its award configuration
 * from the active catalog. If copiedFromEventId is provided, the award
 * enable/disable state and ordering is copied from that event.
 */
export async function createRecognitionEvent(
  input: RecognitionEventCreateInput,
): Promise<RecognitionEvent> {
  validateEventInput(input);

  const supabase = createSupabaseServiceClient();

  // Insert event row
  const { data: eventData, error: eventError } = await supabase
    .from("recognition_events")
    .insert({
      name: input.name.trim(),
      year: input.year,
      month: input.month,
      collect_starts_at: input.collectStartsAt ?? null,
      collect_ends_at: input.collectEndsAt ?? null,
      status: "draft",
      copied_from_event_id: input.copiedFromEventId ?? null,
      created_by_member_id: input.createdByMemberId,
    })
    .select("*")
    .single();

  if (eventError || !eventData) {
    throw new RecognitionServiceError(eventError?.message ?? "Failed to create event.", 500);
  }

  const event = mapEvent(eventData as EventRow);

  // Populate event awards
  await populateEventAwards(event.id, input.copiedFromEventId ?? null);

  return event;
}

/**
 * Populate recognition_event_awards from the active catalog.
 * If sourceEventId provided, copies enable state + ordering from that event.
 */
async function populateEventAwards(
  eventId: string,
  sourceEventId: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // Fetch active award definitions
  const { data: defs, error: defsError } = await supabase
    .from("recognition_award_definitions")
    .select("id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (defsError) {
    throw new RecognitionServiceError(defsError.message, 500);
  }
  if (!defs || defs.length === 0) return;

  type DefRow = { id: string; sort_order: number };
  const defRows = defs as DefRow[];

  // If copying from a source event, fetch its award config
  const sourceAwardMap: Map<string, { isEnabled: boolean; sortOrder: number }> = new Map();
  if (sourceEventId) {
    const { data: sourceAwards, error: sourceError } = await supabase
      .from("recognition_event_awards")
      .select("award_definition_id, is_enabled, sort_order")
      .eq("event_id", sourceEventId);

    if (!sourceError && sourceAwards) {
      type SourceRow = { award_definition_id: string; is_enabled: boolean; sort_order: number };
      for (const row of sourceAwards as SourceRow[]) {
        sourceAwardMap.set(row.award_definition_id, {
          isEnabled: row.is_enabled,
          sortOrder: row.sort_order,
        });
      }
    }
  }

  const rows = defRows.map((def) => {
    const source = sourceAwardMap.get(def.id);
    return {
      event_id: eventId,
      award_definition_id: def.id,
      sort_order: source?.sortOrder ?? def.sort_order,
      is_enabled: source?.isEnabled ?? true,
    };
  });

  const { error: insertError } = await supabase
    .from("recognition_event_awards")
    .insert(rows);

  if (insertError) {
    throw new RecognitionServiceError(insertError.message, 500);
  }
}

export async function updateRecognitionEvent(
  eventId: string,
  input: RecognitionEventUpdateInput,
): Promise<RecognitionEvent> {
  validateEventInput(input);

  // Validate status transitions
  if (input.status) {
    const existing = await getRecognitionEvent(eventId);
    if (!existing) {
      throw new RecognitionServiceError("Event not found.", 404);
    }
    assertValidStatusTransition(existing.status, input.status);
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

function assertValidStatusTransition(
  current: RecognitionEvent["status"],
  next: RecognitionEvent["status"],
): void {
  const allowed: Record<RecognitionEvent["status"], RecognitionEvent["status"][]> = {
    draft:      ["collecting", "archived"],
    collecting: ["closed", "archived"],
    closed:     ["collecting", "archived"], // reopen is allowed per frozen product rule
    archived:   [],
  };
  if (!allowed[current].includes(next)) {
    throw new RecognitionServiceError(
      `Cannot transition event from '${current}' to '${next}'.`,
      400,
    );
  }
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

  // Fire updates sequentially (order matters for consistency)
  for (let i = 0; i < orderedAwardIds.length; i++) {
    const { error } = await supabase
      .from("recognition_event_awards")
      .update({ sort_order: i + 1, updated_at: new Date().toISOString() })
      .eq("id", orderedAwardIds[i]!)
      .eq("event_id", eventId);

    if (error) {
      throw new RecognitionServiceError(error.message, 500);
    }
  }
}
