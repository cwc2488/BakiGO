import type { Platform } from "../normalization/schema";

export type ResolvedCandidateInput = {
  platform: Platform;
  normalized_username: string;
  raw_input: string;
};

const THREADS_HOSTS = ["threads.net", "www.threads.net", "threads.com", "www.threads.com"];
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com"];

export function resolveCandidateInput(input: {
  threads?: string | null;
  instagram?: string | null;
}): ResolvedCandidateInput | { error: string } {
  const threads = input.threads?.trim();
  const instagram = input.instagram?.trim();

  if (!threads && !instagram) {
    return { error: "Provide threads or instagram username/URL" };
  }
  if (threads && instagram) {
    return { error: "Provide only one platform per submission" };
  }

  if (threads) {
    const normalized = parsePlatformInput("threads", threads);
    if ("error" in normalized) return normalized;
    return normalized;
  }

  const normalized = parsePlatformInput("instagram", instagram!);
  if ("error" in normalized) return normalized;
  return normalized;
}

function parsePlatformInput(
  platform: Platform,
  raw: string,
): ResolvedCandidateInput | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Empty username/URL" };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const hosts = platform === "threads" ? THREADS_HOSTS : INSTAGRAM_HOSTS;
      if (!hosts.includes(url.hostname.toLowerCase())) {
        return { error: `URL host does not match ${platform}` };
      }
      const segments = url.pathname.split("/").filter(Boolean);
      const username = segments[0]?.replace(/^@/, "");
      if (!username || ["p", "reel", "tv", "stories"].includes(username)) {
        return { error: "Could not extract username from URL" };
      }
      return {
        platform,
        normalized_username: normalizeUsername(username),
        raw_input: trimmed,
      };
    } catch {
      return { error: "Invalid URL" };
    }
  }

  return {
    platform,
    normalized_username: normalizeUsername(trimmed.replace(/^@/, "")),
    raw_input: trimmed,
  };
}

export function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

export function buildCandidateId(platform: Platform, normalized_username: string): string {
  const slug = normalized_username.replace(/[^a-z0-9._-]/gi, "_").slice(0, 48);
  return `cand_${platform}_${slug}`;
}

export function parseCandidateId(candidate_id: string): {
  platform: Platform | null;
  normalized_username: string | null;
} {
  const match = /^cand_(threads|instagram)_(.+)$/.exec(candidate_id);
  if (!match) return { platform: null, normalized_username: null };
  return {
    platform: match[1] as Platform,
    normalized_username: normalizeUsername(match[2]),
  };
}

export function resolveEnrichUsername(input: {
  payload_username?: string | null;
  stored_username?: string | null;
  candidate_id: string;
  platform?: Platform | null;
}): string | null {
  const fromPayload = input.payload_username ? normalizeUsername(String(input.payload_username)) : "";
  if (fromPayload) return fromPayload;
  const fromStored = input.stored_username ? normalizeUsername(String(input.stored_username)) : "";
  if (fromStored) return fromStored;
  const parsed = parseCandidateId(input.candidate_id);
  if (input.platform && parsed.platform && parsed.platform !== input.platform) {
    return null;
  }
  return parsed.normalized_username;
}
