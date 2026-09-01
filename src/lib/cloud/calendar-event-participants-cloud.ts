/**
 * Optional cloud mirror for calendar_event_participants (migration 074).
 * Local CalendarEvent.participantCustomerIds remains the operational source of truth
 * (synced via member_app_data calendar-events blob). This flush best-effort mirrors
 * links into SQL for uniqueness + RLS when the table exists.
 */
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { uniqueCustomerIds } from "@/lib/calendar/calendar-event-participants";
import type { EntityId } from "@/types";

type FlushOptions = {
  deleted?: boolean;
  removedCustomerId?: EntityId;
  /** Desired participant ids for the event (omit when deleted). */
  participantCustomerIds?: readonly EntityId[];
};

export async function flushCalendarEventParticipantsCloud(
  ownerMemberId: EntityId | undefined,
  eventId: EntityId | undefined,
  options: FlushOptions = {},
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const supabase = createSupabaseBrowserClient();

    if (options.removedCustomerId) {
      if (ownerMemberId && isCloudDatabaseMemberId(ownerMemberId)) {
        await supabase
          .from("calendar_event_participants")
          .delete()
          .eq("owner_member_id", ownerMemberId)
          .eq("customer_id", options.removedCustomerId);
      } else {
        await supabase
          .from("calendar_event_participants")
          .delete()
          .eq("customer_id", options.removedCustomerId);
      }
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
        .eq("event_id", eventId);
      return;
    }

    const desired = uniqueCustomerIds(options.participantCustomerIds);

    const { data: existing, error: readError } = await supabase
      .from("calendar_event_participants")
      .select("id, customer_id")
      .eq("owner_member_id", ownerMemberId)
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
          event_id: eventId,
          customer_id: customerId,
          updated_at: now,
        })),
        { onConflict: "owner_member_id,event_id,customer_id", ignoreDuplicates: true },
      );
    }
  } catch {
    // Non-blocking: local calendar blob remains authoritative.
  }
}
