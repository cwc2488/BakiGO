"use client";

const STORAGE_KEY = "baki-go:fat-loss-quiz-session";

export type FatLossQuizSession = {
  responseId: string;
  respondentName: string;
  shareCode?: string | null;
  answers?: Record<string, string | string[]>;
};

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

export function getShareParams(searchParams: URLSearchParams): {
  shareCode: string | null;
  referrerMemberId: string | null;
} {
  const share = searchParams.get("share") ?? searchParams.get("ref");
  if (!share) {
    return { shareCode: null, referrerMemberId: null };
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(share)) {
    return { shareCode: null, referrerMemberId: share };
  }
  return { shareCode: share.toUpperCase(), referrerMemberId: null };
}
