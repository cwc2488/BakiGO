/**
 * Machine-readable Meta acquisition/enrichment outcomes.
 * These are NOT scoring negatives — they describe official API reachability.
 */
export const META_CAPABILITY_STATES = [
  "available",
  "permission_required",
  "below_threads_profile_threshold",
  "unsupported_account_type",
  "rate_limited",
  "source_unavailable",
  "partial",
] as const;

export type MetaCapabilityState = (typeof META_CAPABILITY_STATES)[number];

export type PlatformCapabilityOutcome = {
  platform: "threads" | "instagram";
  state: MetaCapabilityState;
  reason?: string | null;
};

export function isEnrichmentBlocked(state: MetaCapabilityState): boolean {
  return state === "permission_required" || state === "rate_limited" || state === "source_unavailable";
}
