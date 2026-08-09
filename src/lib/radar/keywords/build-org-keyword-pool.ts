import { normalizeKeywordPhrase } from "./normalize-phrase";

export type KeywordAttribution = {
  member_id: string;
  keyword_id: string;
  phrase: string;
  discovery_weight: number;
};

export type OrgKeywordEntry = {
  normalized_phrase: string;
  display_phrase: string;
  attributions: KeywordAttribution[];
  priority_score: number;
};

export function buildOrgKeywordPool(
  keywords_by_member: Record<
    string,
    Array<{ keyword_id: string; phrase: string; discovery_weight: number }>
  >,
): OrgKeywordEntry[] {
  const byNormalized = new Map<string, OrgKeywordEntry>();

  for (const [member_id, keywords] of Object.entries(keywords_by_member)) {
    for (const keyword of keywords) {
      const normalized_phrase = normalizeKeywordPhrase(keyword.phrase);
      if (!normalized_phrase) continue;

      const attribution: KeywordAttribution = {
        member_id,
        keyword_id: keyword.keyword_id,
        phrase: keyword.phrase,
        discovery_weight: keyword.discovery_weight,
      };

      const existing = byNormalized.get(normalized_phrase);
      if (!existing) {
        byNormalized.set(normalized_phrase, {
          normalized_phrase,
          display_phrase: keyword.phrase,
          attributions: [attribution],
          priority_score: scoreEntry([attribution]),
        });
        continue;
      }

      existing.attributions.push(attribution);
      existing.priority_score = scoreEntry(existing.attributions);
      if (attribution.discovery_weight > weightOf(existing.display_phrase, existing.attributions)) {
        existing.display_phrase = keyword.phrase;
      }
    }
  }

  return [...byNormalized.values()].sort((a, b) => b.priority_score - a.priority_score);
}

function scoreEntry(attributions: KeywordAttribution[]): number {
  const maxWeight = Math.max(...attributions.map((row) => row.discovery_weight), 0);
  const memberSpread = new Set(attributions.map((row) => row.member_id)).size;
  return maxWeight * 10 + memberSpread;
}

function weightOf(
  display_phrase: string,
  attributions: KeywordAttribution[],
): number {
  const match = attributions.find((row) => row.phrase === display_phrase);
  return match?.discovery_weight ?? 0;
}
