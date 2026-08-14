import {
  normalizeTextForDedup,
  normalizedTextSimilarity,
} from "@/lib/radar/normalization/text-utils";

const ADJACENT_SIMILARITY_THRESHOLD = 0.82;
const FRAGMENT_MIN_CHARS = 12;

const DOMAIN_KEYWORDS: Array<{ id: string; keys: string[] }> = [
  { id: "hydration", keys: ["水分", "喝水", "補水", "水量"] },
  { id: "sleep", keys: ["休息", "睡眠", "作息", "晚睡", "入睡", "躺床"] },
  { id: "bowel", keys: ["排便"] },
  { id: "breakfast", keys: ["早餐"] },
  { id: "lunch", keys: ["午餐"] },
  { id: "dinner", keys: ["晚餐"] },
  { id: "satiety", keys: ["飽足", "飢餓", "會餓"] },
  { id: "exercise", keys: ["運動"] },
  { id: "shake", keys: ["奶昔"] },
  { id: "protein", keys: ["蛋白質"] },
];

export type RepeatedSentenceFinding = {
  kind: "exact" | "normalized" | "adjacent_similar" | "fragment";
  kept: string;
  dropped: string;
};

export function splitProseSentences(text: string): string[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?<=[。！？!?；;\n])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function joinProseSentences(sentences: string[]): string {
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join("");
}

export function normalizeCoachingSentence(text: string): string {
  return normalizeTextForDedup(text).replace(/\s+/g, "");
}

function domainSet(text: string): Set<string> {
  const domains = new Set<string>();
  for (const domain of DOMAIN_KEYWORDS) {
    if (domain.keys.some((key) => text.includes(key))) {
      domains.add(domain.id);
    }
  }
  return domains;
}

function distinctRecommendations(a: string, b: string): boolean {
  const left = domainSet(a);
  const right = domainSet(b);
  if (left.size === 0 || right.size === 0) return false;
  for (const id of left) {
    if (right.has(id)) return false;
  }
  return true;
}

function isFragmentDuplicate(a: string, b: string): boolean {
  const left = normalizeCoachingSentence(a);
  const right = normalizeCoachingSentence(b);
  if (!left || !right || left === right) return false;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < FRAGMENT_MIN_CHARS) return false;
  return longer.includes(shorter);
}

function highlySimilar(a: string, b: string): boolean {
  if (distinctRecommendations(a, b)) return false;
  const left = normalizeCoachingSentence(a);
  const right = normalizeCoachingSentence(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (isFragmentDuplicate(a, b)) return true;
  return normalizedTextSimilarity(a, b) >= ADJACENT_SIMILARITY_THRESHOLD;
}

export function findRepeatedSentences(text: string): RepeatedSentenceFinding[] {
  const sentences = splitProseSentences(text);
  const findings: RepeatedSentenceFinding[] = [];
  const kept: string[] = [];
  const keptNormalized = new Set<string>();

  for (const sentence of sentences) {
    const exactHit = kept.find((item) => item === sentence);
    if (exactHit) {
      findings.push({ kind: "exact", kept: exactHit, dropped: sentence });
      continue;
    }
    const normalized = normalizeCoachingSentence(sentence);
    if (normalized && keptNormalized.has(normalized)) {
      const match = kept.find((item) => normalizeCoachingSentence(item) === normalized) ?? sentence;
      findings.push({ kind: "normalized", kept: match, dropped: sentence });
      continue;
    }
    const fragmentHit = kept.find((item) => isFragmentDuplicate(item, sentence));
    if (fragmentHit) {
      findings.push({ kind: "fragment", kept: fragmentHit, dropped: sentence });
      continue;
    }
    const previous = kept[kept.length - 1];
    if (previous && highlySimilar(previous, sentence)) {
      findings.push({ kind: "adjacent_similar", kept: previous, dropped: sentence });
      continue;
    }
    kept.push(sentence);
    if (normalized) keptNormalized.add(normalized);
  }

  return findings;
}

/**
 * Deterministic prose cleanup: exact / normalized duplicates always drop the later copy.
 * Adjacent near-duplicates drop only when they are not distinct recommendations.
 */
export function dedupeCoachingProse(text: string): string {
  const sentences = splitProseSentences(text);
  if (sentences.length <= 1) return text.trim();

  const kept: string[] = [];
  const keptNormalized = new Set<string>();

  for (const sentence of sentences) {
    const normalized = normalizeCoachingSentence(sentence);
    if (kept.some((item) => item === sentence)) continue;
    if (normalized && keptNormalized.has(normalized)) continue;

    const fragmentIndex = kept.findIndex((item) => isFragmentDuplicate(item, sentence));
    if (fragmentIndex >= 0) {
      const existing = kept[fragmentIndex]!;
      if (normalizeCoachingSentence(sentence).length > normalizeCoachingSentence(existing).length) {
        keptNormalized.delete(normalizeCoachingSentence(existing));
        kept[fragmentIndex] = sentence;
        if (normalized) keptNormalized.add(normalized);
      }
      continue;
    }

    const previous = kept[kept.length - 1];
    if (previous && highlySimilar(previous, sentence)) {
      if (normalizeCoachingSentence(sentence).length > normalizeCoachingSentence(previous).length) {
        keptNormalized.delete(normalizeCoachingSentence(previous));
        kept[kept.length - 1] = sentence;
        if (normalized) keptNormalized.add(normalized);
      }
      continue;
    }

    kept.push(sentence);
    if (normalized) keptNormalized.add(normalized);
  }

  return joinProseSentences(kept);
}

export function proseAlreadyCovers(existing: string, extra: string): boolean {
  const extraText = extra.trim();
  if (!extraText) return true;
  const existingText = existing.trim();
  if (!existingText) return false;
  if (existingText.includes(extraText)) return true;
  const extraNorm = normalizeCoachingSentence(extraText);
  const existingNorm = normalizeCoachingSentence(existingText);
  if (extraNorm && existingNorm.includes(extraNorm)) return true;
  if (highlySimilar(existingText, extraText)) return true;
  return splitProseSentences(extraText).every((sentence) => {
    if (existingText.includes(sentence)) return true;
    return splitProseSentences(existingText).some((item) => highlySimilar(item, sentence));
  });
}

export function stripCopiedConsumerSentences(coachText: string, consumerTexts: string[]): string {
  const consumerSentences = consumerTexts.flatMap((text) => splitProseSentences(text));
  const kept = splitProseSentences(coachText).filter((sentence) => {
    return !consumerSentences.some((consumer) => highlySimilar(sentence, consumer));
  });
  return joinProseSentences(kept);
}

export function isCopiedConsumerText(coachText: string, consumerTexts: string[]): boolean {
  const coach = coachText.trim();
  if (!coach) return false;
  return consumerTexts.some((consumer) => {
    const text = consumer.trim();
    if (!text) return false;
    if (coach === text) return true;
    return highlySimilar(coach, text);
  });
}
