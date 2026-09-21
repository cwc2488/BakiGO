/**
 * Event-level personal calendar cloud API (table: calendar_events).
 * One row per event — never push the full calendar JSON blob.
 */
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/types/calendar-event";
import type { EntityId } from "@/types";

export type CalendarEventDbRow = {
  id: string;
  member_id: string;
  created_at: string;
  updated_at: string;
  start_at: string;
  end_at: string;
  is_recurring: boolean;
  payload: CalendarEvent | Record<string, unknown>;
  deleted_at: string | null;
};

export function isCalendarEventRecurring(event: Pick<CalendarEvent, "recurrence">): boolean {
  return Boolean(event.recurrence && event.recurrence.frequency !== "none");
}

export function calendarEventToDbRow(event: CalendarEvent): Omit<CalendarEventDbRow, "deleted_at"> & {
  deleted_at: null;
} {
  return {
    id: event.id,
    member_id: event.memberId,
    created_at: typeof event.createdAt === "string" ? event.createdAt : event.createdAt.toISOString(),
    updated_at: typeof event.updatedAt === "string" ? event.updatedAt : event.updatedAt.toISOString(),
    start_at: event.startAt,
    end_at: event.endAt,
    is_recurring: isCalendarEventRecurring(event),
    payload: event,
    deleted_at: null,
  };
}

export function mapCalendarEventDbRow(row: CalendarEventDbRow): CalendarEvent | null {
  if (row.deleted_at) {
    return null;
  }
  const payload = row.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const event = payload as CalendarEvent;
  if (typeof event.id !== "string" || typeof event.title !== "string") {
    return {
      id: row.id,
      memberId: row.member_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      title: typeof (payload as { title?: string }).title === "string"
        ? (payload as { title: string }).title
        : "(未命名)",
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: Boolean((payload as { allDay?: boolean }).allDay),
      color: ((payload as { color?: CalendarEvent["color"] }).color ?? "green") as CalendarEvent["color"],
      recurrence: (payload as { recurrence?: CalendarEvent["recurrence"] }).recurrence ?? {
        frequency: "none",
        interval: 1,
      },
    };
  }
  return {
    ...event,
    id: row.id,
    memberId: row.member_id,
    createdAt: event.createdAt || row.created_at,
    updatedAt: row.updated_at,
    startAt: event.startAt || row.start_at,
    endAt: event.endAt || row.end_at,
  };
}

/** Outcome of an optimistic calendar upsert (DB-enforced LWW). */
export type CalendarEventUpsertStatus =
  | "inserted"
  | "updated"
  | "ignored_stale"
  | "ignored_deleted"
  | "skipped";

export type CalendarEventUpsertOutcome = {
  status: CalendarEventUpsertStatus;
  /** Canonical active cloud event; null when soft-deleted or skipped. */
  event: CalendarEvent | null;
  /** True when the canonical cloud row is soft-deleted. */
  deleted: boolean;
};

/** Shared concurrency decision (client mirror of DB optimistic rules). */
export function decideOptimisticCalendarUpsert(input: {
  incomingUpdatedAt: string;
  existing: { updated_at: string; deleted_at: string | null } | null;
}): "insert" | "update" | "ignored_stale" | "ignored_deleted" {
  if (!input.existing) {
    return "insert";
  }
  if (input.existing.deleted_at) {
    return "ignored_deleted";
  }
  if (input.incomingUpdatedAt > input.existing.updated_at) {
    return "update";
  }
  return "ignored_stale";
}

function mapOptimisticRpcResult(data: unknown): CalendarEventUpsertOutcome {
  const payload = data as {
    status?: string;
    row?: CalendarEventDbRow | null;
  } | null;
  const status = (payload?.status ?? "skipped") as CalendarEventUpsertStatus;
  const row = payload?.row ?? null;
  if (!row) {
    return { status, event: null, deleted: status === "ignored_deleted" };
  }
  const deleted = Boolean(row.deleted_at);
  return {
    status,
    event: deleted ? null : mapCalendarEventDbRow(row),
    deleted,
  };
}

/**
 * Optimistic upsert via DB RPC (preferred) — never overwrites newer / deleted rows.
 * Falls back to conditional table write if RPC is unavailable.
 */
export async function upsertCloudCalendarEvent(
  event: CalendarEvent,
): Promise<CalendarEventUpsertOutcome> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(event.memberId)) {
    return { status: "skipped", event: null, deleted: false };
  }
  const supabase = createSupabaseBrowserClient();
  const row = calendarEventToDbRow(event);

  const { data, error } = await supabase.rpc("upsert_calendar_event_optimistic", {
    p_id: row.id,
    p_member_id: row.member_id,
    p_created_at: row.created_at,
    p_updated_at: row.updated_at,
    p_start_at: row.start_at,
    p_end_at: row.end_at,
    p_is_recurring: row.is_recurring,
    p_payload: row.payload,
  });

  if (!error) {
    return mapOptimisticRpcResult(data);
  }

  // Fallback when 084 not yet applied: conditional write (trigger will also guard once present).
  const message = error.message ?? "";
  const rpcMissing =
    message.includes("upsert_calendar_event_optimistic") ||
    message.includes("Could not find the function") ||
    error.code === "PGRST202";
  if (!rpcMissing) {
    throw new Error(message);
  }

  return upsertCloudCalendarEventConditionalFallback(event);
}

/** Client-side conditional upsert used only when optimistic RPC is not deployed yet. */
async function upsertCloudCalendarEventConditionalFallback(
  event: CalendarEvent,
): Promise<CalendarEventUpsertOutcome> {
  const supabase = createSupabaseBrowserClient();
  const row = calendarEventToDbRow(event);
  const { data: existingRows, error: readError } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("member_id", event.memberId)
    .eq("id", event.id)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const existing = (existingRows as CalendarEventDbRow | null) ?? null;
  const decision = decideOptimisticCalendarUpsert({
    incomingUpdatedAt: row.updated_at,
    existing: existing
      ? { updated_at: existing.updated_at, deleted_at: existing.deleted_at }
      : null,
  });

  if (decision === "insert") {
    const { data, error } = await supabase.from("calendar_events").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return {
      status: "inserted",
      event: mapCalendarEventDbRow(data as CalendarEventDbRow),
      deleted: false,
    };
  }

  if (decision === "ignored_deleted") {
    return { status: "ignored_deleted", event: null, deleted: true };
  }

  if (decision === "ignored_stale") {
    return {
      status: "ignored_stale",
      event: existing ? mapCalendarEventDbRow(existing) : null,
      deleted: false,
    };
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update({
      created_at: row.created_at,
      updated_at: row.updated_at,
      start_at: row.start_at,
      end_at: row.end_at,
      is_recurring: row.is_recurring,
      payload: row.payload,
    })
    .eq("member_id", event.memberId)
    .eq("id", event.id)
    .is("deleted_at", null)
    .lt("updated_at", row.updated_at)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    const { data: canonical } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("member_id", event.memberId)
      .eq("id", event.id)
      .maybeSingle();
    const canonicalRow = canonical as CalendarEventDbRow | null;
    if (canonicalRow?.deleted_at) {
      return { status: "ignored_deleted", event: null, deleted: true };
    }
    return {
      status: "ignored_stale",
      event: canonicalRow ? mapCalendarEventDbRow(canonicalRow) : null,
      deleted: false,
    };
  }

  return {
    status: "updated",
    event: mapCalendarEventDbRow(data as CalendarEventDbRow),
    deleted: false,
  };
}

/** Soft-delete one event. */
export async function softDeleteCloudCalendarEvent(input: {
  memberId: EntityId;
  eventId: EntityId;
  deletedAt?: string;
}): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return;
  }
  const supabase = createSupabaseBrowserClient();
  const deletedAt = input.deletedAt ?? new Date().toISOString();
  const { error } = await supabase
    .from("calendar_events")
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq("member_id", input.memberId)
    .eq("id", input.eventId)
    .is("deleted_at", null);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Range query for visible calendar window.
 * Includes one-shots overlapping the range plus all active recurring series
 * that started on or before rangeEnd.
 */
export async function fetchCloudCalendarEventsInRange(input: {
  memberId: EntityId;
  rangeStart: string;
  rangeEnd: string;
}): Promise<CalendarEvent[]> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return [];
  }
  const supabase = createSupabaseBrowserClient();

  const { data: overlapping, error: overlapError } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("member_id", input.memberId)
    .is("deleted_at", null)
    .lte("start_at", `${input.rangeEnd}T23:59:59`)
    .gte("end_at", `${input.rangeStart}T00:00:00`);

  if (overlapError) {
    throw new Error(overlapError.message);
  }

  const { data: recurring, error: recurringError } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("member_id", input.memberId)
    .is("deleted_at", null)
    .eq("is_recurring", true)
    .lte("start_at", `${input.rangeEnd}T23:59:59`);

  if (recurringError) {
    throw new Error(recurringError.message);
  }

  const byId = new Map<string, CalendarEvent>();
  for (const row of [...(overlapping ?? []), ...(recurring ?? [])] as CalendarEventDbRow[]) {
    const event = mapCalendarEventDbRow(row);
    if (event) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()];
}

/** Delta sync: events updated after cursor (includes soft-deletes). */
export async function fetchCloudCalendarEventsUpdatedSince(input: {
  memberId: EntityId;
  sinceIso: string;
}): Promise<{ events: CalendarEvent[]; deletedIds: EntityId[]; latestUpdatedAt: string | null }> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return { events: [], deletedIds: [], latestUpdatedAt: null };
  }
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("member_id", input.memberId)
    .gt("updated_at", input.sinceIso)
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const events: CalendarEvent[] = [];
  const deletedIds: EntityId[] = [];
  let latestUpdatedAt: string | null = null;
  for (const row of (data ?? []) as CalendarEventDbRow[]) {
    latestUpdatedAt = row.updated_at;
    if (row.deleted_at) {
      deletedIds.push(row.id);
    } else {
      const event = mapCalendarEventDbRow(row);
      if (event) events.push(event);
    }
  }
  return { events, deletedIds, latestUpdatedAt };
}

/** Decision for legacy → calendar_events merge (never resurrect / never overwrite newer). */
export type LegacyCalendarMergeDecision = "insert" | "update" | "skip";

export function decideLegacyCalendarMerge(input: {
  localUpdatedAt: string;
  cloud: { updated_at: string; deleted_at: string | null } | null;
}): LegacyCalendarMergeDecision {
  const decision = decideOptimisticCalendarUpsert({
    incomingUpdatedAt: input.localUpdatedAt,
    existing: input.cloud,
  });
  if (decision === "insert") return "insert";
  if (decision === "update") return "update";
  return "skip";
}

/**
 * Conditionally merge local/legacy events into calendar_events via optimistic RPC.
 * - INSERT when missing
 * - UPDATE only when local.updatedAt > cloud.updated_at and not soft-deleted
 * - SKIP when cloud is newer/equal or soft-deleted (no resurrection)
 */
export async function upsertCloudCalendarEventsBatch(events: CalendarEvent[]): Promise<number> {
  if (!isSupabaseConfigured() || events.length === 0) {
    return 0;
  }
  const eligible = events.filter((event) => isCloudDatabaseMemberId(event.memberId));
  if (eligible.length === 0) return 0;

  let written = 0;
  for (const event of eligible) {
    const outcome = await upsertCloudCalendarEvent(event);
    if (outcome.status === "inserted" || outcome.status === "updated") {
      written += 1;
    }
  }
  return written;
}

/** @deprecated Use upsertCloudCalendarEventsBatch (now conditional). */
export const upsertCloudCalendarEventsBatchUnconditional = upsertCloudCalendarEventsBatch;

/** Service-role / cron helper shape — map rows from select *. */
export function mapCalendarEventRows(rows: CalendarEventDbRow[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const row of rows) {
    const event = mapCalendarEventDbRow(row);
    if (event) events.push(event);
  }
  return events;
}
