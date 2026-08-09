import type { LocationLevel } from "../scoring/types";
import type { AiRadarExtractionV1 } from "./schema";

export type MemberLocationContext = {
  primary_district?: string;
  primary_city?: string;
  secondary_areas?: Array<{ city?: string; district?: string }>;
};

export function isMemberLocationContextConfigured(
  member?: MemberLocationContext,
): boolean {
  if (!member) return false;
  if (member.primary_district?.trim() || member.primary_city?.trim()) {
    return true;
  }
  return (member.secondary_areas?.length ?? 0) > 0;
}

/** Deterministic resolver — AI must not assign location level or score. */
export function resolveLocationLevel(
  location: AiRadarExtractionV1["location"],
  member?: MemberLocationContext,
): LocationLevel {
  if (!isMemberLocationContextConfigured(member)) {
    return "member_context_neutral";
  }

  if (location.availability !== "available") {
    return "unknown";
  }

  const candidateDistrict = location.normalized_district?.trim();
  const candidateCity = location.normalized_city?.trim();
  const memberDistrict = member?.primary_district?.trim();
  const memberCity = member?.primary_city?.trim();

  if (candidateDistrict && memberDistrict && candidateDistrict === memberDistrict) {
    return "same_district";
  }

  if (candidateCity && memberCity && candidateCity === memberCity) {
    return "same_city";
  }

  if (candidateCity && memberCity) {
    return "far";
  }

  return "unknown";
}
