/**
 * Safe structured diagnostics for Go21 chat — never log tokens, secrets,
 * full conversation, photo URLs, or raw customer payloads.
 */

export type Go21ChatStage =
  | "auth"
  | "validate"
  | "idempotency_lookup"
  | "relevance"
  | "structured_apply"
  | "context_hydrate"
  | "vision"
  | "goal_context"
  | "customer_persist"
  | "generation"
  | "assistant_persist"
  | "reminders"
  | "serialize"
  | "unknown";

export type Go21AssistantErrorCategory =
  | "provider_error"
  | "provider_timeout"
  | "provider_unavailable"
  | "schema_invalid"
  | "persist_failed"
  | "unknown";

export type Go21ChatDiagnostic = {
  event: "go21_chat_diagnostic";
  stage: Go21ChatStage;
  correlationId: string;
  enrollmentId?: string;
  clientRequestIdPresent: boolean;
  customerPersisted: boolean;
  generationStarted: boolean;
  assistantPersisted: boolean;
  errorName: string | null;
  errorMessage: string | null;
  errorCategory: Go21AssistantErrorCategory | null;
  providerStatus: number | null;
  /** Safe pipeline flags — never include photo bytes or free text. */
  visionRan?: boolean | null;
  foodRelevant?: boolean | null;
  currentTurnKind?: string | null;
  generationOutcome?: "ok" | "failed" | "skipped" | "deterministic" | null;
  usableCoachMessage?: boolean | null;
};

const SENSITIVE =
  /(Bearer\s+\S+|sk-[a-zA-Z0-9_-]{10,}|portal[_-]?token|service[_-]?role|authorization|api[_-]?key)/gi;

export function sanitizeGo21ChatErrorMessage(raw: unknown, maxLen = 240): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  return text.replace(SENSITIVE, "[redacted]").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function categorizeGo21GenerationError(error: unknown): {
  category: Go21AssistantErrorCategory;
  providerStatus: number | null;
  retryable: boolean;
  message: string;
} {
  const message = sanitizeGo21ChatErrorMessage(error);
  const name = error instanceof Error ? error.name : "";
  const lower = message.toLowerCase();

  const statusMatch = message.match(/OpenAI V2 coach failed:\s*(\d{3})/i);
  const providerStatus = statusMatch ? Number(statusMatch[1]) : null;

  if (name === "AbortError" || lower.includes("aborted") || lower.includes("timeout")) {
    return { category: "provider_timeout", providerStatus, retryable: true, message };
  }
  if (lower.includes("missing openai_api_key") || lower.includes("unavailable")) {
    return { category: "provider_unavailable", providerStatus, retryable: true, message };
  }
  if (lower.includes("schema invalid") || lower.includes("non-json") || lower.includes("empty content")) {
    return { category: "schema_invalid", providerStatus, retryable: true, message };
  }
  if (lower.includes("persist") || lower.includes("supabase")) {
    return { category: "persist_failed", providerStatus, retryable: true, message };
  }
  if (providerStatus != null || lower.includes("openai")) {
    return { category: "provider_error", providerStatus, retryable: true, message };
  }
  return { category: "unknown", providerStatus, retryable: true, message };
}

export function logGo21ChatDiagnostic(
  partial: Omit<Go21ChatDiagnostic, "event"> & { event?: string },
): void {
  const payload: Go21ChatDiagnostic = {
    event: "go21_chat_diagnostic",
    stage: partial.stage,
    correlationId: partial.correlationId,
    enrollmentId: partial.enrollmentId,
    clientRequestIdPresent: partial.clientRequestIdPresent,
    customerPersisted: partial.customerPersisted,
    generationStarted: partial.generationStarted,
    assistantPersisted: partial.assistantPersisted,
    errorName: partial.errorName,
    errorMessage: partial.errorMessage,
    errorCategory: partial.errorCategory,
    providerStatus: partial.providerStatus,
    visionRan: partial.visionRan ?? null,
    foodRelevant: partial.foodRelevant ?? null,
    currentTurnKind: partial.currentTurnKind ?? null,
    generationOutcome: partial.generationOutcome ?? null,
    usableCoachMessage: partial.usableCoachMessage ?? null,
  };
  console.error(JSON.stringify(payload));
}

export function newGo21ChatCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `go21-corr-${Date.now()}`;
}
