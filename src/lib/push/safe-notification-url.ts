/**
 * Restrict notification deep links to same-origin relative paths.
 * Blocks protocol-relative, absolute external, and javascript: URLs.
 */

const SAFE_INTERNAL_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/;

export function sanitizeNotificationUrl(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith("//") || trimmed.includes("://") || trimmed.toLowerCase().startsWith("javascript:")) {
    return fallback;
  }

  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  if (!SAFE_INTERNAL_PATH.test(trimmed)) {
    return fallback;
  }

  // Disallow navigating into another origin via backslashes / encoded tricks.
  if (trimmed.includes("\\") || trimmed.includes("@")) {
    return fallback;
  }

  return trimmed;
}
