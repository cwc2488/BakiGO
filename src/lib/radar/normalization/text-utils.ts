import { createHash } from "node:crypto";
import { GENERIC_REACTIONS } from "./constants";

const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
const TAG_TOKEN_REGEX = /^[#@][\w\u4e00-\u9fff._-]+$/u;

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTextForDedup(text: string): string {
  return stripUrls(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashContent(text: string, mediaFingerprint = ""): string {
  return createHash("sha256")
    .update(`${text}|${mediaFingerprint}`)
    .digest("hex");
}

export function isEmojiOnly(text: string): boolean {
  const withoutEmoji = text.replace(EMOJI_REGEX, "").replace(/\s+/g, "");
  return withoutEmoji.length === 0 && text.replace(/\s+/g, "").length > 0;
}

export function isUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return stripUrls(trimmed).length === 0;
}

export function isTagOnly(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => TAG_TOKEN_REGEX.test(token));
}

export function isGenericReaction(text: string): boolean {
  const normalized = collapseWhitespace(text).toLowerCase();
  if (GENERIC_REACTIONS.some((r) => normalized === r.toLowerCase())) {
    return true;
  }
  return isEmojiOnly(text);
}

export function isWhitespaceOrPunctuationOnly(text: string): boolean {
  return text.replace(/[\s\p{P}\p{S}]/gu, "").length === 0;
}

export function hasMeaningfulPersonalStatement(text: string): boolean {
  const normalized = collapseWhitespace(text);
  if (normalized.length === 0) return false;

  const intentPatterns = [
    /\b(?:i want|i need|i hope|i decided|i started)\b/i,
    /(?:想|要|希望|決定|開始|受夠|打算|準備)/,
  ];
  if (intentPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const tokens = normalizeTextForDedup(normalized).split(" ").filter(Boolean);
  return tokens.length >= 3;
}

export function trigramSet(text: string): Set<string> {
  const normalized = normalizeTextForDedup(text);
  if (normalized.length === 0) return new Set();
  if (normalized.length <= 3) return new Set([normalized]);

  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[a.length][b.length];
  return 1 - distance / Math.max(a.length, b.length);
}

export function normalizedTextSimilarity(a: string, b: string): number {
  const normA = normalizeTextForDedup(a);
  const normB = normalizeTextForDedup(b);
  if (!normA || !normB) return 0;
  return Math.max(trigramSimilarity(normA, normB), levenshteinRatio(normA, normB));
}

export function mediaFingerprint(
  media: Array<{ media_id: string; kind: string }>,
): string {
  if (media.length === 0) return "";
  return media
    .map((item) => `${item.kind}:${item.media_id}`)
    .sort()
    .join("|");
}

export function buildNormalizedContentId(input: {
  candidate_id: string;
  platform: string;
  external_content_id: string;
}): string {
  return createHash("sha256")
    .update(`${input.candidate_id}:${input.platform}:${input.external_content_id}`)
    .digest("hex")
    .slice(0, 24);
}

export function primaryAnalyzableText(input: {
  candidate_commentary_text: string | null;
  text: string | null;
}): string {
  return collapseWhitespace(
    input.candidate_commentary_text ?? input.text ?? "",
  );
}
