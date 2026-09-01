/**
 * Auth for the one-time 2026-09-01 recovery endpoint.
 * Accepts RADAR_ONE_TIME_RECOVERY_0901_TOKEN or existing RADAR_CRON_SECRET
 * (Production already has RADAR_CRON_SECRET — no new secret required).
 */

import { isRadarCronAuthorized, readRadarCronSecret } from "./service-client";

export function readOneTimeRecovery0901Token(): string {
  return process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN ?? "";
}

function isUsableToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 16;
}

export function isOneTimeRecovery0901Configured(): boolean {
  return (
    isUsableToken(readOneTimeRecovery0901Token()) || isUsableToken(readRadarCronSecret())
  );
}

export function isOneTimeRecovery0901Authorized(request: Request): boolean {
  const dedicated = readOneTimeRecovery0901Token();
  if (dedicated) {
    const header = request.headers.get("authorization");
    if (header?.startsWith("Bearer ") && header.slice("Bearer ".length) === dedicated) {
      return true;
    }
  }
  return isRadarCronAuthorized(request);
}
