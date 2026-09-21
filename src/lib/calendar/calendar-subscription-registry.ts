/**
 * Subscription registry — one active realtime listener per scope key.
 */
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { EntityId } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Unsubscribe = () => void;

interface RegistryEntry {
  key: string;
  refCount: number;
  channel: RealtimeChannel | null;
  cleanup: Unsubscribe | null;
}

const registry = new Map<string, RegistryEntry>();

export function acquireSubscription(
  key: string,
  start: () => { channel: RealtimeChannel; cleanup: Unsubscribe },
): Unsubscribe {
  const existing = registry.get(key);
  if (existing) {
    existing.refCount += 1;
    return () => releaseSubscription(key);
  }

  const started = start();
  registry.set(key, {
    key,
    refCount: 1,
    channel: started.channel,
    cleanup: started.cleanup,
  });
  return () => releaseSubscription(key);
}

function releaseSubscription(key: string): void {
  const entry = registry.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  entry.cleanup?.();
  if (entry.channel) {
    void entry.channel.unsubscribe();
  }
  registry.delete(key);
}

export function getActiveSubscriptionCount(): number {
  return registry.size;
}

export function getActiveSubscriptionKeys(): string[] {
  return [...registry.keys()];
}

export function clearAllSubscriptions(): void {
  for (const key of [...registry.keys()]) {
    const entry = registry.get(key);
    if (!entry) continue;
    entry.refCount = 0;
    entry.cleanup?.();
    if (entry.channel) {
      void entry.channel.unsubscribe();
    }
    registry.delete(key);
  }
}

/**
 * Cloud is source of truth for personal calendar blob in member_app_data.
 * Filter client-side to calendarEvents key.
 */
export function subscribeMemberCalendarAppData(input: {
  memberId: EntityId;
  onCalendarPayload: (payload: unknown, updatedAt: string) => void;
}): Unsubscribe {
  if (!isSupabaseConfigured() || typeof window === "undefined") {
    return () => undefined;
  }

  const key = `calendar:member:${input.memberId}`;
  return acquireSubscription(key, () => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(key)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "member_app_data",
          filter: `member_id=eq.${input.memberId}`,
        },
        (message) => {
          const row = message.new as { data_key?: string; payload?: unknown; updated_at?: string } | null;
          if (!row || row.data_key !== "baki-go:calendar-events") {
            return;
          }
          input.onCalendarPayload(row.payload ?? [], row.updated_at ?? new Date().toISOString());
        },
      )
      .subscribe();

    return {
      channel,
      cleanup: () => {
        void supabase.removeChannel(channel);
      },
    };
  });
}
