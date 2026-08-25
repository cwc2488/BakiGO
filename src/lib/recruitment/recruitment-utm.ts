import type { RecruitmentUtmAttribution } from "@/lib/recruitment/recruitment-contract";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const STORAGE_KEY = "baki:recruitment-utm:v1";

function clip(value: string | null | undefined, max = 200): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function parseRecruitmentUtm(
  source: URLSearchParams | Record<string, string | string[] | undefined | null>,
): RecruitmentUtmAttribution {
  const read = (key: string): string | null => {
    if (source instanceof URLSearchParams) return clip(source.get(key));
    const raw = source[key];
    if (Array.isArray(raw)) return clip(raw[0]);
    return clip(raw ?? null);
  };
  return {
    utmSource: read("utm_source"),
    utmMedium: read("utm_medium"),
    utmCampaign: read("utm_campaign"),
    utmContent: read("utm_content"),
    utmTerm: read("utm_term"),
  };
}

export function mergeRecruitmentUtm(
  current: RecruitmentUtmAttribution,
  incoming: RecruitmentUtmAttribution,
): RecruitmentUtmAttribution {
  return {
    utmSource: current.utmSource ?? incoming.utmSource,
    utmMedium: current.utmMedium ?? incoming.utmMedium,
    utmCampaign: current.utmCampaign ?? incoming.utmCampaign,
    utmContent: current.utmContent ?? incoming.utmContent,
    utmTerm: current.utmTerm ?? incoming.utmTerm,
  };
}

/** Persist first-touch UTM for the public join funnel across client navigations. */
export function captureRecruitmentUtmFromSearch(search: string): RecruitmentUtmAttribution {
  const parsed = parseRecruitmentUtm(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
  if (typeof window === "undefined") return parsed;
  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    const existing = existingRaw
      ? (JSON.parse(existingRaw) as RecruitmentUtmAttribution)
      : {
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmContent: null,
          utmTerm: null,
        };
    const merged = mergeRecruitmentUtm(existing, parsed);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return parsed;
  }
}

export function readStoredRecruitmentUtm(): RecruitmentUtmAttribution {
  if (typeof window === "undefined") {
    return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
    }
    return JSON.parse(raw) as RecruitmentUtmAttribution;
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
  }
}

export function recruitmentUtmPresent(utm: RecruitmentUtmAttribution): boolean {
  return UTM_KEYS.some((key) => {
    const map: Record<(typeof UTM_KEYS)[number], string | null> = {
      utm_source: utm.utmSource,
      utm_medium: utm.utmMedium,
      utm_campaign: utm.utmCampaign,
      utm_content: utm.utmContent,
      utm_term: utm.utmTerm,
    };
    return Boolean(map[key]);
  });
}
