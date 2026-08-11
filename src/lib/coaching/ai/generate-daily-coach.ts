import { buildLlmCallLogEntry, logLlmCall } from "@/lib/ai/llm-telemetry";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import type {
  CoachingAiProvider,
  GenerateDailyCoachInput,
  GenerateDailyCoachResult,
} from "@/lib/coaching/ai/coaching-ai-provider";
import { COACHING_AI_POINT_KEY, type AiLlmCallLogEntry, type CoachingMealImageUsageMetadata } from "@/types/coaching-ai";

export type GenerateDailyCoachWithTelemetryResult = {
  result: GenerateDailyCoachResult;
  telemetryEntry: AiLlmCallLogEntry;
};

export async function generateDailyCoachWithTelemetry(input: {
  provider: CoachingAiProvider;
  request: GenerateDailyCoachInput;
  ownerMemberId?: string | null;
  imageUsageMetadata?: CoachingMealImageUsageMetadata | null;
  persistTelemetry?: boolean;
}): Promise<GenerateDailyCoachWithTelemetryResult> {
  const startedAt = Date.now();
  let result: GenerateDailyCoachResult;

  try {
    result = await input.provider.generateDailyCoach(input.request);
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const telemetryEntry = buildLlmCallLogEntry({
      feature: "coaching",
      pointKey: COACHING_AI_POINT_KEY,
      customerId: input.request.generationInput.customerId,
      enrollmentId: input.request.generationInput.enrollmentId,
      ownerMemberId: input.ownerMemberId ?? null,
      model: "unknown",
      promptVersion: null,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        imageCount: input.request.preparedMealImages.length,
      },
      imageUsageMetadata: input.imageUsageMetadata
        ? { coachingMealImages: input.imageUsageMetadata }
        : null,
      latencyMs,
      status: "failed",
      errorCode: error instanceof Error ? error.name : "provider_error",
      inputFingerprint: fingerprintCoachingGenerationInput(input.request.generationInput),
    });

    if (input.persistTelemetry) {
      await logLlmCall({
        feature: telemetryEntry.feature,
        pointKey: telemetryEntry.pointKey,
        customerId: telemetryEntry.customerId,
        enrollmentId: telemetryEntry.enrollmentId,
        ownerMemberId: telemetryEntry.ownerMemberId,
        model: telemetryEntry.model,
        promptVersion: telemetryEntry.promptVersion,
        usage: {
          inputTokens: telemetryEntry.inputTokens,
          cachedInputTokens: telemetryEntry.cachedInputTokens,
          outputTokens: telemetryEntry.outputTokens,
          imageCount: telemetryEntry.imageCount,
        },
        imageUsageMetadata: telemetryEntry.imageUsageMetadata,
        latencyMs: telemetryEntry.latencyMs,
        status: telemetryEntry.status,
        errorCode: telemetryEntry.errorCode,
        inputFingerprint: telemetryEntry.inputFingerprint,
      });
    }

    throw error;
  }

  const telemetryEntry = buildLlmCallLogEntry({
    feature: "coaching",
    pointKey: COACHING_AI_POINT_KEY,
    customerId: input.request.generationInput.customerId,
    enrollmentId: input.request.generationInput.enrollmentId,
    ownerMemberId: input.ownerMemberId ?? null,
    model: result.model,
    promptVersion: result.promptVersion,
    usage: {
      inputTokens: result.usage.inputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      outputTokens: result.usage.outputTokens,
      imageCount: result.usage.imageCount,
    },
    imageUsageMetadata: input.imageUsageMetadata
      ? { coachingMealImages: input.imageUsageMetadata }
      : null,
    latencyMs: result.latencyMs,
    status: "completed",
    inputFingerprint: fingerprintCoachingGenerationInput(input.request.generationInput),
  });

  if (input.persistTelemetry) {
    const persisted = await logLlmCall({
      feature: telemetryEntry.feature,
      pointKey: telemetryEntry.pointKey,
      customerId: telemetryEntry.customerId,
      enrollmentId: telemetryEntry.enrollmentId,
      ownerMemberId: telemetryEntry.ownerMemberId,
      model: telemetryEntry.model,
      promptVersion: telemetryEntry.promptVersion,
      usage: {
        inputTokens: telemetryEntry.inputTokens,
        cachedInputTokens: telemetryEntry.cachedInputTokens,
        outputTokens: telemetryEntry.outputTokens,
        imageCount: telemetryEntry.imageCount,
      },
      imageUsageMetadata: telemetryEntry.imageUsageMetadata,
      latencyMs: telemetryEntry.latencyMs,
      status: telemetryEntry.status,
      inputFingerprint: telemetryEntry.inputFingerprint,
    });
    return { result, telemetryEntry: persisted };
  }

  return { result, telemetryEntry };
}
