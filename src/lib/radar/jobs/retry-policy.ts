import type { RetryableErrorCode } from "./constants";

export type RetryDecision = {
  retryable: boolean;
  max_attempts: number;
  backoff_ms: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;

const RETRY_POLICY: Record<
  RetryableErrorCode | "SCHEMA_VALIDATION" | "NORMALIZATION_DETERMINISTIC" | "UNKNOWN",
  RetryDecision
> = {
  RATE_LIMIT: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  UPSTREAM_TIMEOUT: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  UPSTREAM_5XX: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  LLM_INVALID_JSON: { retryable: true, max_attempts: 2, backoff_ms: 0 },
  TRANSIENT_DB: { retryable: true, max_attempts: 3, backoff_ms: 5_000 },
  SCHEMA_VALIDATION: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  NORMALIZATION_DETERMINISTIC: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  UNKNOWN: { retryable: true, max_attempts: DEFAULT_MAX_ATTEMPTS, backoff_ms: 10_000 },
};

export function resolveRetryPolicy(error_code: string): RetryDecision {
  if (error_code in RETRY_POLICY) {
    return RETRY_POLICY[error_code as keyof typeof RETRY_POLICY];
  }
  return RETRY_POLICY.UNKNOWN;
}

export function computeBackoffMs(
  decision: RetryDecision,
  attempt_count: number,
): number {
  if (!decision.retryable || decision.backoff_ms <= 0) {
    return 0;
  }
  return decision.backoff_ms * Math.max(1, attempt_count);
}

export function resolveNextJobStatus(input: {
  retryable: boolean;
  attempt_count: number;
  max_attempts: number;
}): "failed" | "dead_letter" {
  if (!input.retryable) {
    return "dead_letter";
  }
  if (input.attempt_count >= input.max_attempts) {
    return "dead_letter";
  }
  return "failed";
}

export function computeAvailableAt(now: Date, backoff_ms: number): Date {
  return new Date(now.getTime() + backoff_ms);
}
