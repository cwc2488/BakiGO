/**
 * Fixture adapters are for unit tests only.
 * Live Preview/Production must never fall back to fixtures when a Meta call fails
 * or when THREADS_ACCESS_TOKEN is missing.
 */
export function shouldUseRadarFixtureAdapters(): boolean {
  if (process.env.RADAR_SOURCE_MODE === "live") {
    return false;
  }
  if (process.env.RADAR_SOURCE_MODE === "fixture") {
    return true;
  }
  return process.env.NODE_ENV === "test";
}

export function isPreviewRadarLiveAllowed(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

export function readSystemThreadsAccessToken(): string | null {
  const token = process.env.THREADS_ACCESS_TOKEN?.trim() ?? "";
  return token || null;
}

export function requireSystemThreadsAccessToken(): string {
  const token = readSystemThreadsAccessToken();
  if (!token) {
    throw new Error("THREADS_ACCESS_TOKEN is absent; refusing fixture fallback.");
  }
  return token;
}

export function readSystemThreadsUsername(): string | null {
  const username = process.env.THREADS_SYSTEM_USERNAME?.trim().replace(/^@/, "") ?? "";
  return username || null;
}
