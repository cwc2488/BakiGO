/**
 * Read-time allocation gate for Radar recommendations (docs/AI_RADAR.md §6.10,
 * docs/BUSINESS_RULES.md → "Radar Candidate Supply & Allocation V1").
 *
 * Two independent questions, answered here and nowhere else:
 *
 *   1. Has THIS member already handled the candidate? (略過 within cooldown,
 *      我認識他, own development history)
 *   2. Does the global allocation lock block ANY member right now? (another
 *      Partner's live claim, post-release cooldown, converted)
 *
 * Both are evaluated against the clock on every read, so a 90-day claim and a
 * 14-day cooldown end on their own. Nothing sweeps or renews them.
 */

import type { MemberDevelopmentState } from "../jobs/constants";
import type { AllocationRules } from "./allocation-rules";
import {
  isClaimBlocking,
  isSkipStillActive,
  meetsMinimumQualifiedScore,
  parseAllocatableAt,
} from "./allocation-rules";

export const SKIP_EXCLUSION_REASON_CODE = "skipped" as const;

export type MemberCandidateStateForEligibility = {
  development_state: MemberDevelopmentState | null;
  excluded_from_recommendations: boolean;
  exclusion_reason_code?: string | null;
  skip_expires_at?: string | Date | null;
};

export type CandidateClaimForEligibility = {
  member_id: string;
  expires_at: string | Date;
  allocatable_at: string | Date;
  released_at: string | Date | null;
};

export type AllocationBlock =
  | "member_development"
  | "member_already_known"
  | "member_skip_cooldown"
  | "member_excluded"
  | "allocation_locked"
  | "below_minimum_score";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Why this member must not be recommended this candidate, if at all.
 *
 * A skipped row written before the timed-skip column existed carries no expiry.
 * It stays excluded: silently resurrecting people a Partner already declined is
 * worse than waiting for a fresh 略過 to start the 30-day clock.
 */
export function memberExclusion(input: {
  state: MemberCandidateStateForEligibility | null;
  now: Date;
}): AllocationBlock | null {
  const state = input.state;
  if (!state) return null;

  if (state.development_state === "already_known") return "member_already_known";
  if (state.development_state) return "member_development";

  if (state.exclusion_reason_code === SKIP_EXCLUSION_REASON_CODE) {
    const expiry = toDate(state.skip_expires_at);
    if (!expiry) return "member_skip_cooldown";
    return isSkipStillActive({ skip_expires_at: expiry, now: input.now })
      ? "member_skip_cooldown"
      : null;
  }

  return state.excluded_from_recommendations ? "member_excluded" : null;
}

/**
 * Whether the global lock keeps the candidate away from this member. The
 * holder's own claim is not a block for them; their `member_candidate_state`
 * governs what they see.
 */
export function allocationLock(input: {
  claim: CandidateClaimForEligibility | null;
  member_id: string;
  now: Date;
}): AllocationBlock | null {
  const claim = input.claim;
  if (!claim) return null;
  if (claim.member_id === input.member_id && !toDate(claim.released_at)) return null;
  return isClaimBlocking({
    allocatable_at: parseAllocatableAt(claim.allocatable_at),
    now: input.now,
  })
    ? "allocation_locked"
    : null;
}

/** The full gate for one candidate: quality first, then personal, then global. */
export function allocationBlockFor(input: {
  member_id: string;
  state: MemberCandidateStateForEligibility | null;
  claim: CandidateClaimForEligibility | null;
  overall_score: number;
  now: Date;
  rules: AllocationRules;
}): AllocationBlock | null {
  if (!meetsMinimumQualifiedScore(input.overall_score, input.rules)) {
    return "below_minimum_score";
  }
  return (
    memberExclusion({ state: input.state, now: input.now }) ??
    allocationLock({ claim: input.claim, member_id: input.member_id, now: input.now })
  );
}

/** Read-time gate for an already-ranked snapshot, where quality was settled at rank time. */
export function isVisibleInFeed(input: {
  member_id: string;
  state: MemberCandidateStateForEligibility | null;
  claim: CandidateClaimForEligibility | null;
  now: Date;
}): boolean {
  return (
    memberExclusion({ state: input.state, now: input.now }) === null &&
    allocationLock({ claim: input.claim, member_id: input.member_id, now: input.now }) === null
  );
}
