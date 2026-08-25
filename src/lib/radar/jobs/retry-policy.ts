import type { RetryableErrorCode } from "./constants";

export type RetryDecision = {
  retryable: boolean;
  max_attempts: number;
  backoff_ms: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;

const RETRY_POLICY: Record<
  | RetryableErrorCode
  | "SCHEMA_VALIDATION"
  | "SCHEMA_INVALID"
  | "INPUT_INVALID"
  | "MISSING_ARTIFACT"
  | "NORMALIZATION_DETERMINISTIC"
  | "STRUCTURED_OUTPUTS_UNSUPPORTED"
  | "UNKNOWN",
  RetryDecision
> = {
  RATE_LIMIT: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  NETWORK: { retryable: true, max_attempts: 5, backoff_ms: 15_000 },
  UPSTREAM_TIMEOUT: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  UPSTREAM_5XX: { retryable: true, max_attempts: 5, backoff_ms: 30_000 },
  LLM_INVALID_JSON: { retryable: true, max_attempts: 2, backoff_ms: 0 },
  TRANSIENT_DB: { retryable: true, max_attempts: 3, backoff_ms: 5_000 },
  SCHEMA_VALIDATION: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  SCHEMA_INVALID: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  INPUT_INVALID: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  MISSING_ARTIFACT: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  NORMALIZATION_DETERMINISTIC: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  STRUCTURED_OUTPUTS_UNSUPPORTED: { retryable: false, max_attempts: 1, backoff_ms: 0 },
  UNKNOWN: { retryable: true, max_attempts: DEFAULT_MAX_ATTEMPTS, backoff_ms: 10_000 },
};

export function resolveRetryPolicy(error_code: string): RetryDecision {
  if (error_code in RETRY_POLICY) {
    return RETRY_POLICY[error_code as keyof typeof RETRY_POLICY];
  }
  return RETRY_POLICY.UNKNOWN;
}

/** Exponential base backoff with jitter so concurrent workers do not align. */
export function computeBackoffMs(
  decision: RetryDecision,
  attempt_count: number,
  random: () => number = Math.random,
): number {
  if (!decision.retryable || decision.backoff_ms <= 0) {
    return 0;
  }
  const attempt = Math.max(1, attempt_count);
  const exponential = decision.backoff_ms * Math.pow(2, attempt - 1);
  const jitter = Math.floor(random() * decision.backoff_ms * 0.25);
  return exponential + jitter;
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
