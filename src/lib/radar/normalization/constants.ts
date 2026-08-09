export const CONTENT_NORMALIZATION_POLICY_ID = "content_normalization_v1" as const;

export const ANALYSIS_WINDOW_DAYS = 90;

/** Initial benchmark threshold — configurable via org policy later. */
export const NEAR_DUPLICATE_SIMILARITY_THRESHOLD = 0.95;

/** Cross-platform posts within this window may dedup as near/cross duplicates. */
export const CROSS_PLATFORM_TIME_WINDOW_MS = 15 * 60 * 1000;

export const GENERIC_REACTIONS = [
  "+1",
  "同意",
  "讚",
  "推",
  "頂",
  "確實",
  "真的",
  "沒錯",
  "笑死",
  "太強了",
  "666",
  "congrats",
  "lol",
  "lmao",
] as const;

export const PLATFORM_PRIORITY_FOR_CANONICAL = ["threads", "instagram"] as const;
