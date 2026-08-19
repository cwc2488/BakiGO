export type InterviewConversationEngine = "legacy" | "native";
export type NativeConsultantVariant = "current" | "chatgpt";

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Native interview engine default for isolated A/B experiments.
 * Preview consumer Deep Conversation is Insight-first (`__insightConsultant`),
 * not this resolver. Production never uses this path (legacy interview).
 * Explicit "current" keeps the QUIZ-AI-28 A experiment available for audit.
 */
export function resolveNativeConsultantVariant(
  requested?: string | null,
): NativeConsultantVariant {
  if (isProductionRuntime()) return "current";
  if (requested === "current") return "current";
  if (requested === "chatgpt") return "chatgpt";
  return "chatgpt";
}

/**
 * Preview / local default is native interview.
 * Production always stays on the existing Conversation Reasoner until human-feel passes.
 */
export function resolveInterviewEngine(requested?: string | null): InterviewConversationEngine {
  if (isProductionRuntime()) return "legacy";
  if (requested === "legacy" || requested === "native") return requested;
  if (process.env.ANALYSIS_INTERVIEW_PATH === "legacy") return "legacy";
  if (process.env.ANALYSIS_INTERVIEW_PATH === "native") return "native";
  return "native";
}

const NATIVE_MODELS = new Set(["gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini-2024-07-18"]);

export function resolveNativeInterviewModel(requested?: string | null): string {
  if (requested && NATIVE_MODELS.has(requested)) return requested;
  const env = process.env.ANALYSIS_NATIVE_INTERVIEW_MODEL;
  if (env && NATIVE_MODELS.has(env)) return env;
  return "gpt-4.1";
}
