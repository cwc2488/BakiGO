/**
 * Retail House page bootstrap — local-first, never hangs on loading forever.
 *
 * Does NOT await cloud reconcile/network. Cloud sync may soft-refresh later
 * via AuthProvider cloudSyncVersion; first paint uses local authoritative data.
 */

import {
  loadMissionControlMetrics,
  readMissionControlMetrics,
} from "@/lib/mission-control/format";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { EntityId } from "@/types";

export type RetailHousePagePhase =
  | "initializing"
  | "loaded"
  | "empty"
  | "error";

export type RetailHouseInitStage =
  | "retail_house_init"
  | "session_ready"
  | "identity_ready"
  | "data_fetch_started"
  | "data_fetch_completed"
  | "data_fetch_failed"
  | "retail_house_ready";

export interface RetailHouseBootstrapResult {
  phase: Exclude<RetailHousePagePhase, "initializing">;
  metrics: MemberComputedMetrics | null;
  stage: RetailHouseInitStage;
  usedCache: boolean;
  durationMs: number;
  errorMessage?: string;
}

/** Safety-net only — sync local load should finish far sooner. */
export const RETAIL_HOUSE_LOAD_WATCHDOG_MS = 12_000;

function logInitStage(
  stage: RetailHouseInitStage,
  payload: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === "test" && stage !== "data_fetch_failed") {
    return;
  }
  const logger = stage === "data_fetch_failed" ? console.error : console.info;
  logger(`[retail_house] ${stage}`, payload);
}

/**
 * Load metrics for Retail House first paint.
 * Skips MapUniverse — RH UI does not need it and it can throw when the
 * authenticated member is not yet present in the local members list.
 */
export function loadRetailHouseMetrics(
  storage: StorageAdapter = createLocalStorageAdapter(),
  memberId?: EntityId,
): MemberComputedMetrics {
  return loadMissionControlMetrics(memberId, storage, undefined, {
    includeMapUniverse: false,
  });
}

/**
 * Bootstrap Retail House presentation data from local storage.
 * Never throws — failures become phase "error".
 */
export function bootstrapRetailHousePage(input?: {
  storage?: StorageAdapter;
  memberId?: EntityId;
  preferCache?: boolean;
}): RetailHouseBootstrapResult {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const storage = input?.storage ?? createLocalStorageAdapter();
  const memberId = input?.memberId;
  const preferCache = input?.preferCache !== false;

  logInitStage("retail_house_init", {});
  logInitStage("session_ready", { hasMemberIdHint: Boolean(memberId) });
  logInitStage("identity_ready", {});
  logInitStage("data_fetch_started", { preferCache });

  try {
    if (preferCache) {
      const cached = readMissionControlMetrics(memberId, storage);
      if (cached) {
        // Soft-recalc for freshness; keep cache if recalc fails.
        try {
          const fresh = loadRetailHouseMetrics(storage, memberId ?? cached.memberId);
          const durationMs =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
          logInitStage("data_fetch_completed", {
            usedCache: false,
            durationMs: Math.round(durationMs),
            source: "recalc_after_cache",
          });
          logInitStage("retail_house_ready", { phase: "loaded" });
          return {
            phase: "loaded",
            metrics: fresh,
            stage: "retail_house_ready",
            usedCache: false,
            durationMs,
          };
        } catch {
          const durationMs =
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
          logInitStage("data_fetch_completed", {
            usedCache: true,
            durationMs: Math.round(durationMs),
            source: "cache_fallback",
          });
          logInitStage("retail_house_ready", { phase: "loaded" });
          return {
            phase: "loaded",
            metrics: cached,
            stage: "retail_house_ready",
            usedCache: true,
            durationMs,
          };
        }
      }
    }

    const metrics = loadRetailHouseMetrics(storage, memberId);
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    logInitStage("data_fetch_completed", {
      usedCache: false,
      durationMs: Math.round(durationMs),
      source: "recalc",
    });
    logInitStage("retail_house_ready", { phase: "loaded" });
    return {
      phase: "loaded",
      metrics,
      stage: "retail_house_ready",
      usedCache: false,
      durationMs,
    };
  } catch (error) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    logInitStage("data_fetch_failed", {
      durationMs: Math.round(durationMs),
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return {
      phase: "error",
      metrics: null,
      stage: "data_fetch_failed",
      usedCache: false,
      durationMs,
      errorMessage: "零售屋暫時載入失敗",
    };
  }
}
