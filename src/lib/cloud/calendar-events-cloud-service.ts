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

/** Upsert a single personal calendar event (idempotent by member_id+id). */
export async function upsertCloudCalendarEvent(event: CalendarEvent): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(event.memberId)) {
    return;
  }
  const supabase = createSupabaseBrowserClient();
  const row = calendarEventToDbRow(event);
  const { error } = await supabase.from("calendar_events").upsert(row, {
    onConflict: "member_id,id",
  });
  if (error) {
    throw new Error(error.message);
  }
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
  if (!input.cloud) {
    return "insert";
  }
  if (input.cloud.deleted_at) {
    return "skip";
  }
  if (input.localUpdatedAt > input.cloud.updated_at) {
    return "update";
  }
  return "skip";
}

/**
 * Conditionally merge local/legacy events into calendar_events.
 * - INSERT when missing
 * - UPDATE only when local.updatedAt > cloud.updated_at and not soft-deleted
 * - SKIP when cloud is newer/equal or soft-deleted (no resurrection)
 */
export async function upsertCloudCalendarEventsBatch(events: CalendarEvent[]): Promise<number> {
  if (!isSupabaseConfigured() || events.length === 0) {
    return 0;
  }
  const supabase = createSupabaseBrowserClient();
  const eligible = events.filter((event) => isCloudDatabaseMemberId(event.memberId));
  if (eligible.length === 0) return 0;

  const byMember = new Map<string, CalendarEvent[]>();
  for (const event of eligible) {
    const list = byMember.get(event.memberId) ?? [];
    list.push(event);
    byMember.set(event.memberId, list);
  }

  let written = 0;
  for (const [memberId, memberEvents] of byMember) {
    const chunkSize = 100;
    for (let i = 0; i < memberEvents.length; i += chunkSize) {
      const chunk = memberEvents.slice(i, i + chunkSize);
      const ids = chunk.map((event) => event.id);
      const { data: existingRows, error: readError } = await supabase
        .from("calendar_events")
        .select("id, updated_at, deleted_at")
        .eq("member_id", memberId)
        .in("id", ids);

      if (readError) {
        throw new Error(readError.message);
      }

      const existingById = new Map(
        (existingRows ?? []).map((row) => [
          String(row.id),
          {
            updated_at: String(row.updated_at),
            deleted_at: (row.deleted_at as string | null) ?? null,
          },
        ]),
      );

      const toInsert: ReturnType<typeof calendarEventToDbRow>[] = [];
      const toUpdate: CalendarEvent[] = [];
      for (const event of chunk) {
        const decision = decideLegacyCalendarMerge({
          localUpdatedAt:
            typeof event.updatedAt === "string" ? event.updatedAt : event.updatedAt.toISOString(),
          cloud: existingById.get(event.id) ?? null,
        });
        if (decision === "insert") {
          toInsert.push(calendarEventToDbRow(event));
        } else if (decision === "update") {
          toUpdate.push(event);
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("calendar_events").insert(toInsert);
        if (error) {
          throw new Error(error.message);
        }
        written += toInsert.length;
      }

      for (const event of toUpdate) {
        const row = calendarEventToDbRow(event);
        const { error } = await supabase
          .from("calendar_events")
          .update({
            created_at: row.created_at,
            updated_at: row.updated_at,
            start_at: row.start_at,
            end_at: row.end_at,
            is_recurring: row.is_recurring,
            payload: row.payload,
          })
          .eq("member_id", memberId)
          .eq("id", event.id)
          .is("deleted_at", null)
          .lt("updated_at", row.updated_at);
        if (error) {
          throw new Error(error.message);
        }
        written += 1;
      }
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
