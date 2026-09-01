/**
 * Auth for the one-time 2026-09-01 recovery endpoint only.
 * Uses RADAR_ONE_TIME_RECOVERY_0901_TOKEN — never RADAR_CRON_SECRET.
 */

export function readOneTimeRecovery0901Token(): string {
  return process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN ?? "";
}

export function isOneTimeRecovery0901Configured(): boolean {
  const token = readOneTimeRecovery0901Token().trim();
  return token.length >= 16;
}

export function isOneTimeRecovery0901Authorized(request: Request): boolean {
  const token = readOneTimeRecovery0901Token();
  if (!token) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === token;
}
