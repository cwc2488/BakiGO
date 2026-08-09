import { CONTENT_NORMALIZATION_POLICY_ID } from "./constants";
import {
  classifyIntrinsicExclusion,
  evaluateCandidateOriginated,
  evaluateMeaningfulExpression,
  resolveExpressionText,
} from "./evaluate-expression";
import { computeContentDedupKey } from "./deduplicate-content";
import type { NormalizedContentItem, RawContentSnapshot } from "./schema";
import { buildNormalizedContentId, collapseWhitespace } from "./text-utils";

export function parseRawContentSnapshot(
  snapshot: RawContentSnapshot,
): NormalizedContentItem {
  const payload = snapshot.payload;
  const text = payload.text ? collapseWhitespace(payload.text) : null;
  const candidate_commentary_text = payload.candidate_commentary_text
    ? collapseWhitespace(payload.candidate_commentary_text)
    : null;

  const content_relationship = payload.content_relationship;
  const is_candidate_originated = evaluateCandidateOriginated({
    payload,
    content_relationship,
  });

  const expression_text = resolveExpressionText({
    candidate_commentary_text,
    text,
    content_relationship,
  });
  const has_meaningful_expression = evaluateMeaningfulExpression(expression_text);

  const exclusion_reason = classifyIntrinsicExclusion({
    content_type: payload.content_type,
    content_relationship,
    is_candidate_originated,
    expression_text,
    has_meaningful_expression,
  });

  const primary_text = expression_text ?? "";
  const media = payload.media ?? [];
  const { content_hash, content_dedup_key } = computeContentDedupKey({
    candidate_id: snapshot.candidate_id,
    primary_text,
    media,
  });

  const normalized_content_id = buildNormalizedContentId({
    candidate_id: snapshot.candidate_id,
    platform: snapshot.platform,
    external_content_id: snapshot.external_content_id,
  });

  const notes: string[] = [];
  if (
    content_relationship === "quote" &&
    candidate_commentary_text &&
    payload.quoted_content
  ) {
    notes.push("quoted_content_preserved_for_context_only");
  }

  const item: NormalizedContentItem = {
    normalized_content_id,
    candidate_id: snapshot.candidate_id,
    platform: snapshot.platform,
    external_content_id: snapshot.external_content_id,
    normalization_policy_version: CONTENT_NORMALIZATION_POLICY_ID,
    raw_snapshot_id: snapshot.raw_snapshot_id,
    adapter_version: snapshot.adapter_version,
    fetched_at: snapshot.fetched_at,
    published_at: payload.published_at,
    content_type: payload.content_type,
    content_relationship,
    text,
    candidate_commentary_text,
    quoted_content: payload.quoted_content ?? null,
    media,
    permalink: payload.permalink ?? null,
    language_hint: null,
    is_candidate_originated,
    has_meaningful_expression,
    is_analyzable: false,
    content_dedup_key,
    duplicate_of: null,
    dedup_class: exclusion_reason ? null : "none",
    exclusion_reason,
    parent_external_content_id: payload.parent_external_content_id,
    root_external_content_id: payload.root_external_content_id,
    in_reply_to_candidate: payload.in_reply_to_candidate,
    normalization_notes: notes,
    content_hash,
  };

  return item;
}
