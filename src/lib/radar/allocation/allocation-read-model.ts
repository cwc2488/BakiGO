/**
 * Read-time allocation views over an already-ranked snapshot.
 *
 * The snapshot is immutable once written, so what a Partner actually sees is
 * decided here on every read: their own handled candidates drop out, and so do
 * candidates the global lock is holding for someone else. Nothing in this file
 * may expose who that someone else is.
 */

import type { RadarRepository } from "../repository/types";
import type { RankedCandidate } from "../scoring/types";
import { isVisibleInFeed } from "./allocation-eligibility";

export async function filterAllocatableForMember(input: {
  repo: RadarRepository;
  member_id: string;
  items: readonly RankedCandidate[];
  now?: Date;
}): Promise<RankedCandidate[]> {
  const now = input.now ?? new Date();
  const claims = await input.repo.listCandidateDevelopmentClaims(
    input.items.map((item) => item.candidateId),
  );
  const claimByCandidate = new Map(claims.map((claim) => [claim.candidate_id, claim]));

  const visible: RankedCandidate[] = [];
  for (const item of input.items) {
    const state = await input.repo.getMemberCandidateState(input.member_id, item.candidateId);
    if (
      isVisibleInFeed({
        member_id: input.member_id,
        state,
        claim: claimByCandidate.get(item.candidateId) ?? null,
        now,
      })
    ) {
      visible.push(item);
    }
  }
  return visible;
}

/** One candidate this member is developing, as the Partner is allowed to see it. */
export type MemberDevelopmentProtection = {
  candidate_id: string;
  /** End of this member's own Radar protection. */
  protected_until: string;
  protection_expired: boolean;
};

/**
 * The member's own live claims. Protection that ran out stays listed as expired:
 * a claim reaching day 90 is not a decision the member made, so it must never be
 * presented as giving up.
 */
export async function loadMemberDevelopmentProtections(input: {
  repo: RadarRepository;
  member_id: string;
  now?: Date;
  limit?: number;
}): Promise<MemberDevelopmentProtection[]> {
  const now = input.now ?? new Date();
  const states = await input.repo.listMemberCandidateStates(input.member_id);
  const inDevelopment = states.filter((state) => state.development_state === "in_progress");
  if (inDevelopment.length === 0) return [];

  const claims = await input.repo.listCandidateDevelopmentClaims(
    inDevelopment.map((state) => state.candidate_id),
  );

  return claims
    .filter((claim) => claim.member_id === input.member_id && !claim.released_at)
    .map((claim) => ({
      candidate_id: claim.candidate_id,
      protected_until: claim.expires_at,
      protection_expired: new Date(claim.expires_at).getTime() <= now.getTime(),
    }))
    .sort((a, b) => a.protected_until.localeCompare(b.protected_until))
    .slice(0, input.limit ?? 20);
}
