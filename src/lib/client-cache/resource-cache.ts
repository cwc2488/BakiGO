/**
 * Lightweight stale-while-revalidate client cache.
 * Questionnaire PII: memory + sessionStorage only (never localStorage).
 */

export type ResourceCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

type StoredEnvelope = {
  v: 1;
  updatedAt: number;
  data: unknown;
};

const memory = new Map<string, ResourceCacheEntry<unknown>>();

const SESSION_PREFIX = "baki:rc:";

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

function notify(key: string): void {
  for (const listener of listeners) {
    try {
      listener(key);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

/** Optional subscribe for cache set / invalidate notifications. */
export function subscribeResourceCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function canUseSession(key: string): boolean {
  // Questionnaire PII + 5＋5 session caches — sessionStorage only
  return (
    key.startsWith("questionnaire:") ||
    key.startsWith("fiveplusfive:") ||
    key.startsWith("home:metrics:")
  );
}

function readSession<T>(key: string): ResourceCacheEntry<T> | null {
  if (typeof window === "undefined" || !canUseSession(key)) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEnvelope;
    if (!parsed || parsed.v !== 1 || typeof parsed.updatedAt !== "number") return null;
    return { data: parsed.data as T, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function writeSession(key: string, entry: ResourceCacheEntry<unknown>): void {
  if (typeof window === "undefined" || !canUseSession(key)) return;
  try {
    const envelope: StoredEnvelope = { v: 1, updatedAt: entry.updatedAt, data: entry.data };
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // quota / private mode — memory still works
  }
}

function removeSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function getCached<T>(key: string): ResourceCacheEntry<T> | null {
  const mem = memory.get(key) as ResourceCacheEntry<T> | undefined;
  if (mem) return mem;
  const session = readSession<T>(key);
  if (session) {
    memory.set(key, session as ResourceCacheEntry<unknown>);
    return session;
  }
  return null;
}

export function setCached<T>(key: string, data: T, now: number = Date.now()): void {
  const entry: ResourceCacheEntry<T> = { data, updatedAt: now };
  memory.set(key, entry as ResourceCacheEntry<unknown>);
  writeSession(key, entry as ResourceCacheEntry<unknown>);
  notify(key);
}

export function invalidateCached(key: string): void {
  memory.delete(key);
  removeSession(key);
  notify(key);
}

export function invalidateCachedPrefix(prefix: string): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const full = window.sessionStorage.key(i);
      if (!full?.startsWith(SESSION_PREFIX)) continue;
      const key = full.slice(SESSION_PREFIX.length);
      if (key.startsWith(prefix)) toRemove.push(full);
    }
    for (const full of toRemove) window.sessionStorage.removeItem(full);
  } catch {
    /* ignore */
  }
}

export function isFresh(key: string, ttlMs: number, now: number = Date.now()): boolean {
  const entry = getCached(key);
  if (!entry) return false;
  return now - entry.updatedAt <= ttlMs;
}

export const RESOURCE_TTL = {
  questionnaireDashboard: 30_000,
  questionnaireLeads: 30_000,
  questionnaireLeadDetail: 60_000,
  fivePlusFive: 30_000,
  homeMetrics: 45_000,
} as const;

export const CACHE_KEYS = {
  questionnaireDashboard: "questionnaire:dashboard",
  questionnaireLeads: (status: string, search: string, page: number) =>
    `questionnaire:leads:${status || "all"}:${search || ""}:${page}`,
  questionnaireLead: (id: string) => `questionnaire:lead:${id}`,
  fivePlusFiveMe: "fiveplusfive:me",
  homeMetricsRefreshAt: "home:metrics:lastRefreshAt",
} as const;

/** Clear questionnaire + 5＋5 caches after mutations. */
export function invalidateQuestionnaireCaches(): void {
  invalidateCachedPrefix("questionnaire:");
}

export function invalidateFivePlusFiveCaches(): void {
  invalidateCachedPrefix("fiveplusfive:");
}
