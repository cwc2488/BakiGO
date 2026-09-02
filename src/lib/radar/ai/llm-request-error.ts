/**
 * Classifies OpenAI / network failures for Radar analyze jobs.
 * Transient codes must remain retryable at the queue layer; schema/input
 * failures must stay non-retryable and observable.
 */

export const RADAR_LLM_ERROR_CODES = [
  "RATE_LIMIT",
  "NETWORK",
  "UPSTREAM_5XX",
  "UPSTREAM_TIMEOUT",
  "LLM_UPSTREAM",
  "LLM_INVALID_JSON",
  "STRUCTURED_OUTPUTS_UNSUPPORTED",
] as const;

export type RadarLlmErrorCode = (typeof RADAR_LLM_ERROR_CODES)[number];

export class RadarLlmRequestError extends Error {
  readonly code: RadarLlmErrorCode;
  readonly retryAfterMs: number | null;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    code: RadarLlmErrorCode,
    options?: { retryAfterMs?: number | null; httpStatus?: number | null; cause?: unknown },
  ) {
    super(message);
    this.name = "RadarLlmRequestError";
    this.code = code;
    this.retryAfterMs = options?.retryAfterMs ?? null;
    this.httpStatus = options?.httpStatus ?? null;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isRadarLlmRequestError(error: unknown): error is RadarLlmRequestError {
  return error instanceof RadarLlmRequestError;
}

export function parseRetryAfterMs(header: string | null, fallbackMs = 0): number | null {
  if (!header) return fallbackMs > 0 ? fallbackMs : null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(Number(trimmed) * 1000));
  }
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) {
    return Math.max(0, when - Date.now());
  }
  return fallbackMs > 0 ? fallbackMs : null;
}

export function classifyOpenAiHttpError(input: {
  status: number;
  message: string;
  retryAfterHeader?: string | null;
}): RadarLlmRequestError {
  const retryAfterMs = parseRetryAfterMs(input.retryAfterHeader ?? null);
  if (input.status === 429 || /rate limit|tokens per min|TPM/i.test(input.message)) {
    return new RadarLlmRequestError(input.message, "RATE_LIMIT", {
      httpStatus: input.status,
      retryAfterMs,
    });
  }
  if (input.status === 408 || input.status === 504) {
    return new RadarLlmRequestError(input.message, "UPSTREAM_TIMEOUT", {
      httpStatus: input.status,
      retryAfterMs,
    });
  }
  if (input.status >= 500) {
    return new RadarLlmRequestError(input.message, "UPSTREAM_5XX", {
      httpStatus: input.status,
      retryAfterMs,
    });
  }
  if (/json_schema|structured output/i.test(input.message)) {
    return new RadarLlmRequestError(
      `OPENAI_STRUCTURED_OUTPUTS_UNSUPPORTED: ${input.message}`,
      "STRUCTURED_OUTPUTS_UNSUPPORTED",
      { httpStatus: input.status },
    );
  }
  return new RadarLlmRequestError(input.message, "LLM_UPSTREAM", {
    httpStatus: input.status,
    retryAfterMs,
  });
}

export function classifyFetchFailure(error: unknown): RadarLlmRequestError {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout|timed out/i.test(message)) {
    return new RadarLlmRequestError(message, "UPSTREAM_TIMEOUT", { cause: error });
  }
  return new RadarLlmRequestError(
    message.trim() ? message : "fetch failed",
    "NETWORK",
    { cause: error },
  );
}

export function isTransientLlmError(error: unknown): boolean {
  if (!isRadarLlmRequestError(error)) return false;
  return (
    error.code === "RATE_LIMIT" ||
    error.code === "NETWORK" ||
    error.code === "UPSTREAM_5XX" ||
    error.code === "UPSTREAM_TIMEOUT"
  );
}
