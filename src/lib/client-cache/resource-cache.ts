/**
 * Lightweight stale-while-revalidate client cache.
 * Questionnaire PII: memory + sessionStorage only (never localStorage).
 * Keys are member-scoped via ensureResourceCacheOwner — never share across accounts.
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
const OWNER_SESSION_KEY = "baki:rc:owner";

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

let memoryOwner: string | null = null;

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

function readSessionOwner(): string | null {
  if (typeof window === "undefined") return memoryOwner;
  try {
    const raw = window.sessionStorage.getItem(OWNER_SESSION_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return memoryOwner;
  }
}

function writeSessionOwner(memberId: string): void {
  memoryOwner = memberId;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OWNER_SESSION_KEY, memberId);
  } catch {
    /* ignore */
  }
}

function clearSessionOwner(): void {
  memoryOwner = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OWNER_SESSION_KEY);
  } catch {
    /* ignore */
  }
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

export function getResourceCacheOwner(): string | null {
  if (memoryOwner) return memoryOwner;
  const sessionOwner = readSessionOwner();
  if (sessionOwner) {
    memoryOwner = sessionOwner;
    return sessionOwner;
  }
  return null;
}

/**
 * Bind resource cache to the authenticated member.
 * If owner changes, wipe questionnaire / 5＋5 / home:metrics caches immediately.
 */
export function ensureResourceCacheOwner(memberId: string): void {
  const next = (memberId ?? "").trim();
  if (!next) return;
  const current = getResourceCacheOwner();
  if (current === next) return;
  clearSensitiveResourceCache();
  writeSessionOwner(next);
}

/**
 * Clear only this PR's sensitive resource cache (not Calendar IndexedDB / CRM).
 */
export function clearSensitiveResourceCache(): void {
  invalidateCachedPrefix("questionnaire:");
  invalidateCachedPrefix("fiveplusfive:");
  invalidateCachedPrefix("home:metrics:");
  clearSessionOwner();
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
    if (key.startsWith(prefix)) {
      memory.delete(key);
      notify(key);
    }
  }
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const full = window.sessionStorage.key(i);
      if (!full?.startsWith(SESSION_PREFIX)) continue;
      // OWNER_SESSION_KEY is baki:rc:owner — not under SESSION_PREFIX + data key pattern for prefixes
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
