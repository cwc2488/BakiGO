"use client";

import { useAuth } from "@/lib/auth/auth-context";
import {
  applyCloudCalendarPayload,
  bootstrapCalendarStoreFromLocal,
  flushCalendarPendingMutationQueue,
  flushCalendarWriteThrough,
  pullCalendarDeltaFromCloud,
} from "@/lib/calendar/calendar-cloud-sync";
import { resetCalendarStore } from "@/lib/calendar/calendar-event-store";
import {
  clearAllSubscriptions,
  subscribeMemberCalendarAppData,
} from "@/lib/calendar/calendar-subscription-registry";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useEffect, useMemo, useRef } from "react";

/**
 * App-level calendar sync lifecycle:
 * - hydrate from local cache immediately
 * - write-through flush on online / foreground
 * - single realtime subscription per member
 * - delta pull when realtime is unavailable
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

    let cancelled = false;
    const unsubscribeRealtime = subscribeMemberCalendarAppData({
      memberId,
      onCalendarPayload: (payload, updatedAt) => {
        if (cancelled) return;
        applyCloudCalendarPayload({ storage, memberId, payload, updatedAt });
      },
    });

    async function initialDelta() {
      try {
        await flushCalendarPendingMutationQueue(storage);
        await flushCalendarWriteThrough(storage);
        if (!cancelled) {
          await pullCalendarDeltaFromCloud({ storage, memberId: memberId! });
        }
      } catch (error) {
        console.error("Calendar delta sync failed:", error);
      }
    }

    if (startedFor.current !== memberId) {
      startedFor.current = memberId;
      void initialDelta();
    }

    function handleOnline() {
      void flushCalendarPendingMutationQueue(storage).then(() =>
        pullCalendarDeltaFromCloud({ storage, memberId: memberId! }),
      );
    }

    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      void flushCalendarPendingMutationQueue(storage);
      // Delta only — never full historical reload.
      void pullCalendarDeltaFromCloud({ storage, memberId: memberId! });
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      cancelled = true;
      unsubscribeRealtime();
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
