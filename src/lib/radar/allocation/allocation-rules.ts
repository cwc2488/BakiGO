/**
 * Radar allocation rules v1 — the single source for the allocation constants
 * defined in docs/BUSINESS_RULES.md → "Radar Candidate Supply & Allocation V1".
 *
 * Components, queries, and action handlers must read these values from here.
 * Re-declaring 30 / 90 / 14 / 40 / 20 anywhere else is a bug (Priority 0).
 */

export const RADAR_ALLOCATION_RULES_VERSION = "radar_allocation_v1" as const;

export type AllocationRules = {
  /** 略過 excludes the candidate from that member's feed for this long. */
  skip_cooldown_days: number;
  /** 開始開發 gives the claiming member exclusive allocation for this long. */
  development_claim_days: number;
  /** After a claim ends, no member may be allocated the candidate for this long. */
  post_release_global_cooldown_days: number;
  /** Score below this never enters Top20, at any list length. */
  minimum_qualified_score: number;
  /** Ceiling on a member's daily recommendations — never a quota to fill. */
  daily_recommendation_cap: number;
};

export const DEFAULT_ALLOCATION_RULES: AllocationRules = {
  skip_cooldown_days: 30,
  development_claim_days: 90,
  post_release_global_cooldown_days: 14,
  minimum_qualified_score: 40,
  daily_recommendation_cap: 20,
};

/** Why a claim stopped holding the candidate. */
export const CLAIM_RELEASE_REASONS = [
  "failed",
  "gave_up",
  "expired",
  "converted",
] as const;

export type ClaimReleaseReason = (typeof CLAIM_RELEASE_REASONS)[number];

/**
 * When the candidate becomes allocatable again. `never` covers conversion to a
 * Customer: ownership moves to `customers.owner_member_id` and Radar must not
 * hand the person out again.
 */
export type AllocatableAt = { kind: "at"; at: Date } | { kind: "never" };

export type ClaimWindow = {
  claimed_at: Date;
  expires_at: Date;
  allocatable_at: AllocatableAt;
};

/** How Postgres spells an unbounded timestamptz. */
const INFINITY_TIMESTAMP = "infinity";

/** `candidate_development_claims.allocatable_at` as stored, back into rules terms. */
export function parseAllocatableAt(value: string | Date | null | undefined): AllocatableAt {
  if (value instanceof Date) return { kind: "at", at: value };
  const raw = value?.trim().toLowerCase();
  if (!raw) return { kind: "never" };
  if (raw === INFINITY_TIMESTAMP || raw === "+infinity") return { kind: "never" };
  const at = new Date(value as string);
  return Number.isNaN(at.getTime()) ? { kind: "never" } : { kind: "at", at };
}

/** The same value on its way back to the database. */
export function serializeAllocatableAt(value: AllocatableAt): string {
  return value.kind === "never" ? INFINITY_TIMESTAMP : value.at.toISOString();
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function parseAllocationRules(
  raw: Record<string, unknown> | null | undefined,
): AllocationRules {
  const config = raw ?? {};
  return {
    skip_cooldown_days: positiveNumber(
      config.skip_cooldown_days,
      DEFAULT_ALLOCATION_RULES.skip_cooldown_days,
    ),
    development_claim_days: positiveNumber(
      config.development_claim_days,
      DEFAULT_ALLOCATION_RULES.development_claim_days,
    ),
    post_release_global_cooldown_days: positiveNumber(
      config.post_release_global_cooldown_days,
      DEFAULT_ALLOCATION_RULES.post_release_global_cooldown_days,
    ),
    minimum_qualified_score: positiveNumber(
      config.minimum_qualified_score,
      DEFAULT_ALLOCATION_RULES.minimum_qualified_score,
    ),
    daily_recommendation_cap: positiveNumber(
      config.daily_recommendation_cap,
      DEFAULT_ALLOCATION_RULES.daily_recommendation_cap,
    ),
  };
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 略過 — expiry timestamp stored on `member_candidate_state.skip_expires_at`. */
export function skipExpiresAt(input: { now: Date; rules: AllocationRules }): Date {
  return addDays(input.now, input.rules.skip_cooldown_days);
}

/**
 * 開始開發 — the timestamps a new claim is written with. `allocatable_at`
 * already includes the post-release cooldown, so a claim that simply runs out
 * still blocks reallocation for the cooldown without any sweeper job.
 */
export function claimWindow(input: { now: Date; rules: AllocationRules }): ClaimWindow {
  const expires_at = addDays(input.now, input.rules.development_claim_days);
  return {
    claimed_at: input.now,
    expires_at,
    allocatable_at: {
      kind: "at",
      at: addDays(expires_at, input.rules.post_release_global_cooldown_days),
    },
  };
}

/** `failed` / `gave_up` end the claim early; the global cooldown runs from now. */
export function releaseAllocatableAt(input: {
  released_at: Date;
  reason: ClaimReleaseReason;
  rules: AllocationRules;
}): AllocatableAt {
  if (input.reason === "converted") return { kind: "never" };
  return {
    kind: "at",
    at: addDays(input.released_at, input.rules.post_release_global_cooldown_days),
  };
}

/**
 * Read-time allocation gate (§6.10.4). A claim blocks other members until its
 * `allocatable_at`; reaching that instant is enough, no job has to run.
 */
export function isClaimBlocking(input: {
  allocatable_at: AllocatableAt;
  now: Date;
}): boolean {
  if (input.allocatable_at.kind === "never") return true;
  return input.allocatable_at.at.getTime() > input.now.getTime();
}

/** Read-time personal gate for 略過. `already_known` never expires. */
export function isSkipStillActive(input: {
  skip_expires_at: Date | null;
  now: Date;
}): boolean {
  if (!input.skip_expires_at) return false;
  return input.skip_expires_at.getTime() > input.now.getTime();
}

/** Quality gate. Compares the unrounded canonical score, never a display value. */
export function meetsMinimumQualifiedScore(
  score: number,
  rules: AllocationRules,
): boolean {
  return score >= rules.minimum_qualified_score;
}

/**
 * Applies the daily ceiling. A shorter list is a correct result, never padded.
 *
 * The ceiling is a property of the day, not of a single run: a candidate already
 * recommended today keeps its place for free, and only someone new spends a
 * slot, so re-running cannot hand a member more people than the cap.
 */
export function capDailyRecommendations<T extends { candidateId: string }>(
  ranked: readonly T[],
  input: { already_recommended_today: ReadonlySet<string>; rules: AllocationRules },
): T[] {
  let newSlots = Math.max(
    0,
    input.rules.daily_recommendation_cap - input.already_recommended_today.size,
  );
  const kept: T[] = [];
  for (const item of ranked) {
    if (kept.length >= input.rules.daily_recommendation_cap) break;
    if (input.already_recommended_today.has(item.candidateId)) {
      kept.push(item);
      continue;
    }
    if (newSlots === 0) continue;
    newSlots -= 1;
    kept.push(item);
  }
  return kept;
}
