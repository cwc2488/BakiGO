import { estimateLlmCost } from "@/lib/ai/cost-estimator";
import { fingerprintCoachingInputSnapshot } from "@/lib/ai/input-fingerprint";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { AiLlmCallLogEntry, LlmUsageCounts } from "@/types/coaching-ai";

export { fingerprintCoachingGenerationInput, fingerprintCoachingInputSnapshot } from "@/lib/ai/input-fingerprint";

export function buildLlmCallLogEntry(input: {
  feature: AiLlmCallLogEntry["feature"];
  pointKey: string | null;
  customerId: string | null;
  enrollmentId: string | null;
  ownerMemberId: string | null;
  model: string;
  promptVersion: string | null;
  usage: LlmUsageCounts;
  imageUsageMetadata?: AiLlmCallLogEntry["imageUsageMetadata"];
  latencyMs: number | null;
  status?: AiLlmCallLogEntry["status"];
  errorCode?: string | null;
  inputFingerprint?: string | null;
}): AiLlmCallLogEntry {
  const imageCount = Math.max(0, input.usage.imageCount ?? 0);
  const cost = estimateLlmCost({
    model: input.model,
    inputTokens: input.usage.inputTokens,
    cachedInputTokens: input.usage.cachedInputTokens,
    outputTokens: input.usage.outputTokens,
    imageCount,
  });

  return {
    feature: input.feature,
    pointKey: input.pointKey,
    customerId: input.customerId,
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
    model: input.model,
    promptVersion: input.promptVersion,
    inputTokens: cost.inputTokens,
    cachedInputTokens: cost.cachedInputTokens,
    outputTokens: cost.outputTokens,
    imageCount: cost.imageCount,
    imageUsageMetadata: input.imageUsageMetadata ?? null,
    latencyMs: input.latencyMs,
    estimatedCostUsd: cost.pricingFound ? cost.estimatedCostUsd : null,
    pricingFound: cost.pricingFound,
    status: input.status ?? "completed",
    errorCode: input.errorCode ?? null,
    inputFingerprint: input.inputFingerprint ?? null,
  };
}

export async function logLlmCall(input: Parameters<typeof buildLlmCallLogEntry>[0]): Promise<AiLlmCallLogEntry> {
  const entry = buildLlmCallLogEntry(input);

  if (!isSupabaseServiceConfigured()) {
    return entry;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ai_llm_call_log")
    .insert({
      feature: entry.feature,
      point_key: entry.pointKey,
      customer_id: entry.customerId,
      enrollment_id: entry.enrollmentId,
      owner_member_id: entry.ownerMemberId,
      model: entry.model,
      prompt_version: entry.promptVersion,
      input_tokens: entry.inputTokens,
      cached_input_tokens: entry.cachedInputTokens,
      output_tokens: entry.outputTokens,
      image_count: entry.imageCount,
      image_usage_metadata: entry.imageUsageMetadata,
      latency_ms: entry.latencyMs,
      estimated_cost_usd: entry.estimatedCostUsd,
      pricing_found: entry.pricingFound,
      status: entry.status,
      error_code: entry.errorCode,
      input_fingerprint: entry.inputFingerprint,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapLlmCallLogRow(data as Record<string, unknown>);
}

function mapLlmCallLogRow(row: Record<string, unknown>): AiLlmCallLogEntry {
  return {
    id: String(row.id),
    feature: row.feature as AiLlmCallLogEntry["feature"],
    pointKey: row.point_key ? String(row.point_key) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    enrollmentId: row.enrollment_id ? String(row.enrollment_id) : null,
    ownerMemberId: row.owner_member_id ? String(row.owner_member_id) : null,
    model: String(row.model),
    promptVersion: row.prompt_version ? String(row.prompt_version) : null,
    inputTokens: Number(row.input_tokens ?? 0),
    cachedInputTokens: Number(row.cached_input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    imageCount: Number(row.image_count ?? 0),
    imageUsageMetadata: (row.image_usage_metadata as AiLlmCallLogEntry["imageUsageMetadata"]) ?? null,
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    estimatedCostUsd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
    pricingFound: Boolean(row.pricing_found),
    status: row.status as AiLlmCallLogEntry["status"],
    errorCode: row.error_code ? String(row.error_code) : null,
    inputFingerprint: row.input_fingerprint ? String(row.input_fingerprint) : null,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}
