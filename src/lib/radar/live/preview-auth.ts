import {
  isCoachingCronAuthorized,
  isRadarCronAuthorized,
} from "@/lib/supabase/service-client";
import { isPreviewRadarLiveAllowed } from "@/lib/radar/sources/live-mode";

export function isPreviewRadarLiveAuthorized(request: Request): boolean {
  if (isRadarCronAuthorized(request) || isCoachingCronAuthorized(request)) {
    return true;
  }
  return request.headers.get("x-baki-radar-live") === "1";
}

export function previewRadarLiveGuard(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  if (!isPreviewRadarLiveAllowed()) {
    return { ok: false, status: 403, error: "RADAR-LIVE-01 is blocked on Production." };
  }
  if (!isPreviewRadarLiveAuthorized(request)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
