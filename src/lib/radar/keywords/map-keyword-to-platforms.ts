import type { Platform } from "../normalization/schema";

export type InstagramDiscoveryAction =
  | { action: "skip"; reason: "enrichment_only_v1" }
  | { action: "audit_only"; reason: "hashtag_analytics_future"; hashtag: string };

export type KeywordPlatformMapping = {
  threads: { eligible: true; query: string };
  instagram: InstagramDiscoveryAction;
};

/**
 * Production discover mapping — Threads only for automated stranger discovery.
 * Instagram is enrichment-only; hashtag paths are never candidate sources in V1.
 */
export function mapKeywordToPlatforms(phrase: string): KeywordPlatformMapping {
  const query = phrase.trim();
  return {
    threads: { eligible: true, query },
    instagram: { action: "skip", reason: "enrichment_only_v1" },
  };
}

/** Platforms eligible for automated discover jobs (production contract). */
export function discoverPlatformsForKeyword(_phrase: string): Platform[] {
  return ["threads"];
}
