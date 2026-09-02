/**
 * Optional cloud mirror for calendar_event_participants (074 + 075).
 * Local stores remain operational source of truth. SQL uniqueness is
 * (owner_member_id, event_source, event_id, customer_id).
 */
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { uniqueCustomerIds } from "@/lib/calendar/calendar-event-participants";
import type { EntityId } from "@/types";
import {
  CALENDAR_EVENT_SOURCE,
  type CalendarEventSource,
} from "@/types/calendar-event-participant";

type FlushOptions = {
  deleted?: boolean;
  removedCustomerId?: EntityId;
  eventSource?: CalendarEventSource;
  participantCustomerIds?: readonly EntityId[];
};

export async function flushCalendarEventParticipantsCloud(
  ownerMemberId: EntityId | undefined,
  eventId: EntityId | undefined,
  options: FlushOptions = {},
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const eventSource = options.eventSource ?? CALENDAR_EVENT_SOURCE.PERSONAL;

  try {
    const supabase = createSupabaseBrowserClient();

    if (options.removedCustomerId) {
      let query = supabase
        .from("calendar_event_participants")
        .delete()
        .eq("customer_id", options.removedCustomerId)
        .eq("event_source", eventSource);
      if (ownerMemberId && isCloudDatabaseMemberId(ownerMemberId)) {
        query = query.eq("owner_member_id", ownerMemberId);
      }
      await query;
      return;
    }

    if (!ownerMemberId || !isCloudDatabaseMemberId(ownerMemberId) || !eventId) {
      return;
    }

    if (options.deleted) {
      await supabase
        .from("calendar_event_participants")
        .delete()
        .eq("owner_member_id", ownerMemberId)
        .eq("event_source", eventSource)
        .eq("event_id", eventId);
      return;
    }

    const desired = uniqueCustomerIds(options.participantCustomerIds);

    const { data: existing, error: readError } = await supabase
      .from("calendar_event_participants")
      .select("id, customer_id")
      .eq("owner_member_id", ownerMemberId)
      .eq("event_source", eventSource)
      .eq("event_id", eventId);

    if (readError) {
      return;
    }

    const existingIds = new Set((existing ?? []).map((row) => String(row.customer_id)));
    const desiredSet = new Set(desired);

    const toRemove = (existing ?? []).filter((row) => !desiredSet.has(String(row.customer_id)));
    if (toRemove.length > 0) {
      await supabase
        .from("calendar_event_participants")
        .delete()
        .in(
          "id",
          toRemove.map((row) => String(row.id)),
        );
    }

    const toAdd = desired.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      const now = new Date().toISOString();
      await supabase.from("calendar_event_participants").upsert(
        toAdd.map((customerId) => ({
          owner_member_id: ownerMemberId,
          event_source: eventSource,
          event_id: eventId,
          customer_id: customerId,
          updated_at: now,
        })),
        {
          onConflict: "owner_member_id,event_source,event_id,customer_id",
          ignoreDuplicates: true,
        },
      );
    }
  } catch {
    // Non-blocking: local stores remain authoritative.
  }
}
