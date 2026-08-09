import {
  CROSS_PLATFORM_TIME_WINDOW_MS,
  NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
  PLATFORM_PRIORITY_FOR_CANONICAL,
} from "./constants";
import type { DedupClass, ExclusionReason, NormalizedContentItem, Platform } from "./schema";
import { hashContent, mediaFingerprint, normalizeTextForDedup, normalizedTextSimilarity } from "./text-utils";

export function computeContentDedupKey(input: {
  candidate_id: string;
  primary_text: string;
  media: Array<{ media_id: string; kind: string }>;
}): { content_hash: string; content_dedup_key: string } {
  const normalized = normalizeTextForDedup(input.primary_text);
  const fingerprint = mediaFingerprint(input.media);
  const content_hash = hashContent(normalized, fingerprint);
  return {
    content_hash,
    content_dedup_key: `${input.candidate_id}:${content_hash}`,
  };
}

function metadataRichness(item: NormalizedContentItem): number {
  let score = 0;
  if (item.text) score += 1;
  if (item.candidate_commentary_text) score += 1;
  if (item.media.length > 0) score += item.media.length;
  if (item.permalink) score += 1;
  if (item.quoted_content) score += 1;
  return score;
}

function platformRank(platform: Platform): number {
  const index = PLATFORM_PRIORITY_FOR_CANONICAL.indexOf(platform);
  return index === -1 ? PLATFORM_PRIORITY_FOR_CANONICAL.length : index;
}

function compareCanonical(a: NormalizedContentItem, b: NormalizedContentItem): number {
  const richnessDiff = metadataRichness(b) - metadataRichness(a);
  if (richnessDiff !== 0) return richnessDiff;

  const platformDiff = platformRank(a.platform) - platformRank(b.platform);
  if (platformDiff !== 0) return platformDiff;

  const publishedDiff =
    new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
  if (publishedDiff !== 0) return publishedDiff;

  return new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime();
}

function withinCrossPlatformWindow(a: NormalizedContentItem, b: NormalizedContentItem): boolean {
  if (a.platform === b.platform) return true;
  const delta = Math.abs(
    new Date(a.published_at).getTime() - new Date(b.published_at).getTime(),
  );
  return delta <= CROSS_PLATFORM_TIME_WINDOW_MS;
}

function isNearDuplicate(a: NormalizedContentItem, b: NormalizedContentItem): boolean {
  const textA = normalizeTextForDedup(
    a.candidate_commentary_text ?? a.text ?? "",
  );
  const textB = normalizeTextForDedup(
    b.candidate_commentary_text ?? b.text ?? "",
  );
  if (!textA || !textB) return false;
  return normalizedTextSimilarity(textA, textB) >= NEAR_DUPLICATE_SIMILARITY_THRESHOLD;
}

function pickCanonical(group: NormalizedContentItem[]): NormalizedContentItem {
  return [...group].sort(compareCanonical)[0];
}

export function deduplicateContentItems(
  items: NormalizedContentItem[],
): NormalizedContentItem[] {
  const mutable = items.map((item) => ({ ...item }));
  const hashGroups = new Map<string, NormalizedContentItem[]>();

  for (const item of mutable) {
    if (item.exclusion_reason) continue;
    const group = hashGroups.get(item.content_dedup_key) ?? [];
    group.push(item);
    hashGroups.set(item.content_dedup_key, group);
  }

  for (const group of hashGroups.values()) {
    if (group.length <= 1) continue;
    markDuplicateGroup(group, "exact", "duplicate");
  }

  const canonicalByHash = new Map<string, NormalizedContentItem>();
  for (const item of mutable) {
    if (!item.duplicate_of && !item.exclusion_reason) {
      canonicalByHash.set(item.content_dedup_key, item);
    }
  }

  const canonicals = [...canonicalByHash.values()];
  for (let i = 0; i < canonicals.length; i++) {
    for (let j = i + 1; j < canonicals.length; j++) {
      const a = canonicals[i];
      const b = canonicals[j];
      if (a.duplicate_of || b.duplicate_of) continue;

      if (a.content_hash === b.content_hash) {
        if (a.platform !== b.platform && withinCrossPlatformWindow(a, b)) {
          markPairDuplicate(a, b, "cross_platform", "cross_platform_duplicate");
        } else if (a.platform === b.platform) {
          markPairDuplicate(a, b, "exact", "duplicate");
        }
        continue;
      }

      if (isNearDuplicate(a, b)) {
        markPairDuplicate(a, b, "near_duplicate", "near_duplicate");
      }
    }
  }

  return mutable.map((item) => finalizeAnalyzability(item));
}

function markDuplicateGroup(
  group: NormalizedContentItem[],
  dedupClass: DedupClass,
  exclusionReason: ExclusionReason,
): void {
  const canonical = pickCanonical(group);
  const spansPlatforms = new Set(group.map((item) => item.platform)).size > 1;
  const resolvedDedupClass = spansPlatforms && dedupClass === "exact" ? "cross_platform" : dedupClass;
  const resolvedReason =
    spansPlatforms && exclusionReason === "duplicate"
      ? "cross_platform_duplicate"
      : exclusionReason;

  for (const item of group) {
    if (item.normalized_content_id === canonical.normalized_content_id) {
      item.dedup_class = item.dedup_class ?? "none";
      continue;
    }
    item.duplicate_of = canonical.normalized_content_id;
    item.dedup_class = resolvedDedupClass;
    item.exclusion_reason = resolvedReason;
    item.is_analyzable = false;
  }
}

function markPairDuplicate(
  a: NormalizedContentItem,
  b: NormalizedContentItem,
  dedupClass: DedupClass,
  exclusionReason: ExclusionReason,
): void {
  const canonical = pickCanonical([a, b]);
  const duplicate = canonical.normalized_content_id === a.normalized_content_id ? b : a;
  if (duplicate.duplicate_of) return;

  duplicate.duplicate_of = canonical.normalized_content_id;
  duplicate.dedup_class = dedupClass;
  duplicate.exclusion_reason = exclusionReason;
  duplicate.is_analyzable = false;
}

function finalizeAnalyzability(item: NormalizedContentItem): NormalizedContentItem {
  const analyzable =
    item.exclusion_reason === null &&
    item.duplicate_of === null &&
    item.is_candidate_originated &&
    item.has_meaningful_expression;

  return {
    ...item,
    is_analyzable: analyzable,
  };
}

export function deriveAnalyzability(item: NormalizedContentItem): boolean {
  return (
    item.exclusion_reason === null &&
    item.duplicate_of === null &&
    item.is_candidate_originated &&
    item.has_meaningful_expression
  );
}
