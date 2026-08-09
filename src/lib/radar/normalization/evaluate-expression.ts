import type { ContentRelationship, ExclusionReason, RawContentPayload } from "./schema";
import {
  hasMeaningfulPersonalStatement,
  isEmojiOnly,
  isGenericReaction,
  isTagOnly,
  isUrlOnly,
  isWhitespaceOrPunctuationOnly,
  primaryAnalyzableText,
} from "./text-utils";

export function evaluateCandidateOriginated(input: {
  payload: RawContentPayload;
  content_relationship: ContentRelationship;
}): boolean {
  const { payload, content_relationship } = input;

  if (!payload.is_authored_by_candidate) {
    return false;
  }

  if (content_relationship === "repost") {
    return Boolean(payload.candidate_commentary_text?.trim());
  }

  return true;
}

export function evaluateMeaningfulExpression(text: string | null): boolean {
  if (!text) return false;

  const normalized = text.trim();
  if (!normalized) return false;
  if (isWhitespaceOrPunctuationOnly(normalized)) return false;
  if (isEmojiOnly(normalized)) return false;
  if (isUrlOnly(normalized)) return false;
  if (isTagOnly(normalized)) return false;
  if (isGenericReaction(normalized)) return false;

  return hasMeaningfulPersonalStatement(normalized);
}

export function resolveExpressionText(item: {
  candidate_commentary_text: string | null;
  text: string | null;
  content_relationship: ContentRelationship;
}): string | null {
  if (
    item.content_relationship === "quote" ||
    item.content_relationship === "repost"
  ) {
    const commentary = item.candidate_commentary_text?.trim();
    return commentary || null;
  }

  const text = primaryAnalyzableText(item);
  return text || null;
}

export function classifyIntrinsicExclusion(input: {
  content_type: RawContentPayload["content_type"];
  content_relationship: ContentRelationship;
  is_candidate_originated: boolean;
  expression_text: string | null;
  has_meaningful_expression: boolean;
}): ExclusionReason | null {
  if (input.content_type === "story") {
    return "platform_unsupported";
  }

  if (!input.is_candidate_originated) {
    if (input.content_relationship === "repost") {
      return "pure_repost";
    }
    return "unattributable";
  }

  const text = input.expression_text?.trim() ?? "";
  if (!text) {
    return input.content_relationship === "repost" ? "pure_repost" : "empty_share";
  }

  if (!input.has_meaningful_expression) {
    return "no_expression";
  }

  return null;
}
