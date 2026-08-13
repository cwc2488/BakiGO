"use client";

import { useEffect, useRef } from "react";

type SoftRefreshOptions = {
  /** When false, listeners/polling are idle. Default true. */
  enabled?: boolean;
  /** Soft-poll while true (e.g. AI pending/processing). */
  pollWhile?: boolean;
  /** Poll interval while pollWhile is true. Default 12s. */
  pollIntervalMs?: number;
};

/**
 * Soft-refresh on window focus, visibility → visible, and bfcache pageshow.
 * Optionally polls while `pollWhile` is true. Does not touch realtime subscriptions.
 */
export function useSoftRefresh(
  refresh: () => void | Promise<void>,
  options: SoftRefreshOptions = {},
): void {
  const { enabled = true, pollWhile = false, pollIntervalMs = 12_000 } = options;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const inFlightRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const run = () => {
      const now = Date.now();
      if (inFlightRef.current || now - lastRunAtRef.current < 400) {
        return;
      }
      lastRunAtRef.current = now;
      inFlightRef.current = true;
      void Promise.resolve(refreshRef.current())
        .catch(() => {
          /* caller owns error UI */
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const onFocus = () => {
      run();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Initial load also fires pageshow; only refresh bfcache restores here.
      if (event.persisted) {
        run();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    let pollId: number | null = null;
    if (pollWhile && pollIntervalMs > 0) {
      pollId = window.setInterval(run, pollIntervalMs);
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      if (pollId !== null) {
        window.clearInterval(pollId);
      }
    };
  }, [enabled, pollIntervalMs, pollWhile]);
}
