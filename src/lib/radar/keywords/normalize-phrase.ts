/**
 * Normalize keyword phrases for org-level deduplication.
 * Preserves CJK characters; lowercases ASCII letters; collapses whitespace.
 */
export function normalizeKeywordPhrase(phrase: string): string {
  return phrase
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[A-Za-z]+/g, (segment) => segment.toLowerCase());
}
