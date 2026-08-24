"use client";

const STORAGE_KEY = "baki-go:fat-loss-quiz-session";
/** Survives result-page clear of quiz progress; holds /r opaque token + /q share code. */
const ATTRIBUTION_KEY = "baki-go:fat-loss-quiz-attribution";

export type FatLossQuizSession = {
  responseId: string;
  respondentName: string;
  shareCode?: string | null;
  answers?: Record<string, string | string[]>;
};

export type FatLossQuizAttribution = {
  /** Opaque /r growth share token — never a UUID share id. */
  referralShareToken?: string | null;
  shareCode?: string | null;
  referrerMemberId?: string | null;
  /** Opaque /s consumer result-share code. Never a Partner /q code. */
  resultShareCode?: string | null;
};

export function mergeFatLossQuizAttribution(
  existing: FatLossQuizAttribution,
  next: FatLossQuizAttribution,
): FatLossQuizAttribution {
  const merged: FatLossQuizAttribution = {
    ...existing,
    ...next,
  };
  if (existing.referralShareToken) {
    merged.referralShareToken = existing.referralShareToken;
  }
  if (!next.shareCode && existing.shareCode) {
    merged.shareCode = existing.shareCode;
  }
  if (!next.referrerMemberId && existing.referrerMemberId) {
    merged.referrerMemberId = existing.referrerMemberId;
  }
  if (existing.resultShareCode) {
    merged.resultShareCode = existing.resultShareCode;
  }
  return merged;
}

export function loadFatLossQuizSession(): FatLossQuizSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as FatLossQuizSession;
  } catch {
    return null;
  }
}

export function saveFatLossQuizSession(session: FatLossQuizSession): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearFatLossQuizSession(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function loadFatLossQuizAttribution(): FatLossQuizAttribution | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as FatLossQuizAttribution;
  } catch {
    return null;
  }
}

/**
 * Merge attribution. Referral `/r` opaque token wins and must not be overwritten by later `/q` params.
 * `/s` resultShareCode is additive evidence and must not clear `/r` or `/q`.
 */
export function saveFatLossQuizAttribution(next: FatLossQuizAttribution): void {
  if (typeof window === "undefined") {
    return;
  }
  const existing = loadFatLossQuizAttribution() ?? {};
  window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(mergeFatLossQuizAttribution(existing, next)));
}

export function getShareParams(searchParams: URLSearchParams): {
  shareCode: string | null;
  referrerMemberId: string | null;
  /** Opaque /r token from `gs` (growth share) query param. */
  referralShareToken: string | null;
  /** Opaque /s result-share code from `rs`. Never treated as Partner /q. */
  resultShareCode: string | null;
} {
  const referralShareToken = searchParams.get("gs")?.trim() || null;
  const resultShareCode = searchParams.get("rs")?.trim().toUpperCase() || null;
  const share = searchParams.get("share") ?? searchParams.get("ref");
  if (!share) {
    return { shareCode: null, referrerMemberId: null, referralShareToken, resultShareCode };
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(share)) {
    return { shareCode: null, referrerMemberId: share, referralShareToken, resultShareCode };
  }
  return { shareCode: share.toUpperCase(), referrerMemberId: null, referralShareToken, resultShareCode };
}
