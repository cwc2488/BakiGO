import { z } from "zod";
import { CONTENT_NORMALIZATION_POLICY_ID } from "./constants";

export const platformSchema = z.enum(["threads", "instagram"]);

export const contentTypeSchema = z.enum([
  "text_post",
  "image_post",
  "video_post",
  "carousel_post",
  "story",
  "reply",
  "quote_post",
  "repost",
  "thread_root",
  "thread_continuation",
  "unknown",
]);

export const contentRelationshipSchema = z.enum([
  "original",
  "reply",
  "quote",
  "repost",
  "thread_part",
]);

export const exclusionReasonSchema = z.enum([
  "pure_repost",
  "duplicate",
  "cross_platform_duplicate",
  "near_duplicate",
  "empty_share",
  "no_expression",
  "unattributable",
  "promotional_spam",
  "platform_unsupported",
  "privacy_redacted",
]);

export const dedupClassSchema = z.enum([
  "none",
  "exact",
  "cross_platform",
  "repost",
  "near_duplicate",
]);

export const dataCompletenessSchema = z.enum(["full", "partial"]);

export const quotedContentRefSchema = z.object({
  platform: platformSchema,
  external_content_id: z.string().min(1),
  author_handle: z.string().optional(),
  text_preview: z.string().optional(),
  permalink: z.string().url().optional(),
});

export const normalizedMediaAssetSchema = z.object({
  media_id: z.string().min(1),
  kind: z.enum(["image", "video", "carousel", "audio", "gif", "unknown"]),
  mime_type: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  alt_text: z.string().optional(),
  has_text_overlay: z.boolean(),
});

export const normalizedContentItemSchema = z.object({
  normalized_content_id: z.string().min(1),
  candidate_id: z.string().min(1),
  platform: platformSchema,
  external_content_id: z.string().min(1),
  normalization_policy_version: z.literal(CONTENT_NORMALIZATION_POLICY_ID),
  raw_snapshot_id: z.string().min(1),
  adapter_version: z.string().min(1),
  fetched_at: z.string().datetime(),
  published_at: z.string().datetime(),
  content_type: contentTypeSchema,
  content_relationship: contentRelationshipSchema,
  text: z.string().nullable(),
  candidate_commentary_text: z.string().nullable(),
  quoted_content: quotedContentRefSchema.nullable(),
  media: z.array(normalizedMediaAssetSchema),
  permalink: z.string().url().nullable(),
  language_hint: z.string().nullable(),
  is_candidate_originated: z.boolean(),
  has_meaningful_expression: z.boolean(),
  is_analyzable: z.boolean(),
  content_dedup_key: z.string().min(1),
  duplicate_of: z.string().nullable(),
  dedup_class: dedupClassSchema.nullable(),
  exclusion_reason: exclusionReasonSchema.nullable(),
  parent_external_content_id: z.string().optional(),
  root_external_content_id: z.string().optional(),
  in_reply_to_candidate: z.boolean().optional(),
  normalization_notes: z.array(z.string()),
  content_hash: z.string().min(1),
});

export const profileObservabilityContentItemSchema = z.object({
  content_id: z.string().min(1),
  platform: platformSchema,
  published_at: z.string().datetime(),
  is_candidate_originated: z.literal(true),
  has_meaningful_expression: z.literal(true),
});

export const candidateContentCorpusSchema = z.object({
  candidate_id: z.string().min(1),
  normalization_run_id: z.string().min(1),
  normalization_policy_version: z.literal(CONTENT_NORMALIZATION_POLICY_ID),
  normalized_at: z.string().datetime(),
  platforms_included: z.array(platformSchema),
  data_completeness: dataCompletenessSchema,
  items: z.array(normalizedContentItemSchema),
  analysis_window_days: z.literal(90),
  window_start_at: z.string().datetime(),
  window_end_at: z.string().datetime(),
  analyzable_items: z.array(profileObservabilityContentItemSchema),
  last_meaningful_activity_at: z.string().datetime().nullable(),
  counts: z.object({
    raw_item_count: z.number().int().nonnegative(),
    normalized_item_count: z.number().int().nonnegative(),
    analyzable_item_count: z.number().int().nonnegative(),
    excluded_by_reason: z.record(exclusionReasonSchema, z.number().int().nonnegative()),
  }),
});

export type Platform = z.infer<typeof platformSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
export type ContentRelationship = z.infer<typeof contentRelationshipSchema>;
export type ExclusionReason = z.infer<typeof exclusionReasonSchema>;
export type DedupClass = z.infer<typeof dedupClassSchema>;
export type DataCompleteness = z.infer<typeof dataCompletenessSchema>;
export type QuotedContentRef = z.infer<typeof quotedContentRefSchema>;
export type NormalizedMediaAsset = z.infer<typeof normalizedMediaAssetSchema>;
export type NormalizedContentItem = z.infer<typeof normalizedContentItemSchema>;
export type ProfileObservabilityContentItem = z.infer<
  typeof profileObservabilityContentItemSchema
>;
export type CandidateContentCorpus = z.infer<typeof candidateContentCorpusSchema>;

export const rawContentPayloadSchema = z.object({
  published_at: z.string().datetime(),
  content_type: contentTypeSchema,
  content_relationship: contentRelationshipSchema,
  text: z.string().nullable().optional(),
  candidate_commentary_text: z.string().nullable().optional(),
  quoted_content: quotedContentRefSchema.nullable().optional(),
  media: z.array(normalizedMediaAssetSchema).optional(),
  permalink: z.string().url().nullable().optional(),
  is_authored_by_candidate: z.boolean(),
  parent_external_content_id: z.string().optional(),
  root_external_content_id: z.string().optional(),
  in_reply_to_candidate: z.boolean().optional(),
});

export const rawContentSnapshotSchema = z.object({
  raw_snapshot_id: z.string().min(1),
  candidate_id: z.string().min(1),
  platform: platformSchema,
  external_content_id: z.string().min(1),
  fetched_at: z.string().datetime(),
  adapter_version: z.string().min(1),
  payload: rawContentPayloadSchema,
  fetch_completeness: dataCompletenessSchema,
});

export type RawContentPayload = z.infer<typeof rawContentPayloadSchema>;
export type RawContentSnapshot = z.infer<typeof rawContentSnapshotSchema>;
