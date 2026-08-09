const SENSITIVE_PATTERNS = [
  /access_token[=:]\s*\S+/gi,
  /client_secret[=:]\s*\S+/gi,
  /Bearer\s+\S+/gi,
  /EAA[A-Za-z0-9]+/g,
];

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized.trim();
}

export function sanitizeThreadsApiError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }
  if (typeof error === "string") {
    return sanitizeErrorMessage(error);
  }
  return "Unknown error";
}

export function parseThreadsGraphError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Threads API request failed.";
  }

  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const graphError = error as Record<string, unknown>;
    const message =
      typeof graphError.error_user_msg === "string"
        ? graphError.error_user_msg
        : typeof graphError.message === "string"
          ? graphError.message
          : "Threads API request failed.";
    return sanitizeErrorMessage(message);
  }

  return "Threads API request failed.";
}
