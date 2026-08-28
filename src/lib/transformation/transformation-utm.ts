import type { TransformationAttribution } from "@/lib/transformation/transformation-contract";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const STORAGE_KEY = "baki:transformation-attribution:v1";

function clip(value: string | null | undefined, max = 200): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function emptyTransformationAttribution(): TransformationAttribution {
  return {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    fbclid: null,
    campaignId: null,
    adsetId: null,
    adId: null,
    placement: null,
  };
}

export function parseTransformationAttribution(
  source: URLSearchParams | Record<string, string | string[] | undefined | null>,
): TransformationAttribution {
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
    fbclid: read("fbclid"),
    campaignId: read("campaign_id") ?? read("utm_id"),
    adsetId: read("adset_id"),
    adId: read("ad_id"),
    placement: read("placement"),
  };
}

export function mergeTransformationAttribution(
  current: TransformationAttribution,
  incoming: TransformationAttribution,
): TransformationAttribution {
  return {
    utmSource: current.utmSource ?? incoming.utmSource,
    utmMedium: current.utmMedium ?? incoming.utmMedium,
    utmCampaign: current.utmCampaign ?? incoming.utmCampaign,
    utmContent: current.utmContent ?? incoming.utmContent,
    utmTerm: current.utmTerm ?? incoming.utmTerm,
    fbclid: current.fbclid ?? incoming.fbclid,
    campaignId: current.campaignId ?? incoming.campaignId,
    adsetId: current.adsetId ?? incoming.adsetId,
    adId: current.adId ?? incoming.adId,
    placement: current.placement ?? incoming.placement,
  };
}

/** Persist first-touch attribution for the public transform funnel across client navigations. */
export function captureTransformationAttributionFromSearch(search: string): TransformationAttribution {
  const parsed = parseTransformationAttribution(
    new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
  );
  if (typeof window === "undefined") return parsed;
  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    const existing = existingRaw
      ? (JSON.parse(existingRaw) as TransformationAttribution)
      : emptyTransformationAttribution();
    const merged = mergeTransformationAttribution(existing, parsed);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return parsed;
  }
}

export function readStoredTransformationAttribution(): TransformationAttribution {
  if (typeof window === "undefined") return emptyTransformationAttribution();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyTransformationAttribution();
    return JSON.parse(raw) as TransformationAttribution;
  } catch {
    return emptyTransformationAttribution();
  }
}

export function transformationAttributionPresent(attribution: TransformationAttribution): boolean {
  return (
    UTM_KEYS.some((key) => {
      const map: Record<(typeof UTM_KEYS)[number], string | null> = {
        utm_source: attribution.utmSource,
        utm_medium: attribution.utmMedium,
        utm_campaign: attribution.utmCampaign,
        utm_content: attribution.utmContent,
        utm_term: attribution.utmTerm,
      };
      return Boolean(map[key]);
    }) ||
    Boolean(
      attribution.fbclid ||
        attribution.campaignId ||
        attribution.adsetId ||
        attribution.adId ||
        attribution.placement,
    )
  );
}
