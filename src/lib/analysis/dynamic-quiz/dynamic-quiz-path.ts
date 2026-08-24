import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";

export type AnalysisProductPath = "legacy" | "interview_only" | "native_v1";

/**
 * Production always stays on the existing Conversation Reasoner.
 * Preview default is native_v1: dynamic MC quiz → unverified animal payoff → Insight-first gpt-4.1.
 * interview_only recovers the P2.8 native interview without the dynamic quiz.
 */
export function resolveAnalysisProductPath(requested?: string | null): AnalysisProductPath {
  if (isProductionRuntime()) return "legacy";
  if (requested === "legacy" || requested === "interview_only" || requested === "native_v1") {
    return requested;
  }
  if (requested === "native") return "interview_only";
  const env = process.env.ANALYSIS_PRODUCT_PATH;
  if (env === "legacy" || env === "interview_only" || env === "native_v1") return env;
  return "native_v1";
}

export function resolveDynamicQuizModel(requested?: string | null): string {
  if (requested === "gpt-4.1" || requested === "gpt-4.1-mini") return requested;
  if (process.env.ANALYSIS_DYNAMIC_QUIZ_MODEL === "gpt-4.1") return "gpt-4.1";
  return "gpt-4.1-mini";
}
