"use client";

import { useAuth } from "@/lib/auth/auth-context";
import {
  applyCalendarEventRealtimeChange,
  bootstrapCalendarStoreFromLocal,
  flushCalendarPendingMutationQueue,
  flushCalendarWriteThrough,
  migrateLegacyCalendarBlobToRows,
  pullCalendarDeltaFromCloud,
  pullCalendarRangeFromCloud,
  reconcileCloudLegacyCalendarBlob,
} from "@/lib/calendar/calendar-cloud-sync";
import { resetCalendarStore } from "@/lib/calendar/calendar-event-store";
import {
  clearAllSubscriptions,
  subscribeMemberCalendarEvents,
} from "@/lib/calendar/calendar-subscription-registry";
import { idbClearExpiredCalendarRanges } from "@/lib/calendar/calendar-idb-cache";
import { pruneCalendarLocalRetention } from "@/lib/calendar/calendar-storage-bounds";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useEffect, useMemo, useRef } from "react";

/**
 * App-level calendar sync lifecycle:
 * - hydrate bounded local range immediately
 * - migrate local legacy blob → event rows BEFORE realtime subscribe
 * - write-through flush on online / foreground
 * - single event-level realtime subscription per member
 * - delta / range pull (never full historical reload)
 */
export function CalendarSyncBootstrap() {
  const { session } = useAuth();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const memberId = session?.memberId ?? null;
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      clearAllSubscriptions();
      resetCalendarStore();
      startedFor.current = null;
      return;
    }

    bootstrapCalendarStoreFromLocal({ storage, memberId });
    pruneCalendarLocalRetention(storage);
    void idbClearExpiredCalendarRanges();

    let cancelled = false;
    let unsubscribeRealtime: (() => void) | null = null;

    async function initialSync() {
      try {
        // Migrate first so bulk upserts do not flood a live realtime listener.
        await migrateLegacyCalendarBlobToRows({ storage, memberId: memberId! });
        await reconcileCloudLegacyCalendarBlob(memberId!);
        await flushCalendarPendingMutationQueue(storage);
        await flushCalendarWriteThrough(storage);
        if (cancelled) return;

        unsubscribeRealtime = subscribeMemberCalendarEvents({
          memberId: memberId!,
          onChange: (change) => {
            if (cancelled) return;
            applyCalendarEventRealtimeChange(change);
          },
        });

        await pullCalendarRangeFromCloud({ storage, memberId: memberId! });
      } catch (error) {
        console.error("Calendar range sync failed:", error);
        if (!cancelled && !unsubscribeRealtime) {
          unsubscribeRealtime = subscribeMemberCalendarEvents({
            memberId: memberId!,
            onChange: (change) => {
              if (cancelled) return;
              applyCalendarEventRealtimeChange(change);
            },
          });
        }
      }
    }

    if (startedFor.current !== memberId) {
      startedFor.current = memberId;
      void initialSync();
    }

    function handleOnline() {
      void flushCalendarPendingMutationQueue(storage).then(() =>
        pullCalendarDeltaFromCloud({ storage, memberId: memberId! }),
      );
    }

    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      void flushCalendarPendingMutationQueue(storage);
      void pullCalendarDeltaFromCloud({ storage, memberId: memberId! });
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      cancelled = true;
      unsubscribeRealtime?.();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [memberId, storage]);

  useEffect(() => {
    return () => {
      if (!memberId) {
        clearAllSubscriptions();
      }
    };
  }, [memberId]);

  return null;
}
