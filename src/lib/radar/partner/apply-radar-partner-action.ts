import { memberExclusion } from "../allocation/allocation-eligibility";
import {
  claimWindow,
  parseAllocationRules,
  RADAR_ALLOCATION_RULES_VERSION,
  releaseAllocatableAt,
  skipExpiresAt,
} from "../allocation/allocation-rules";
import type { MemberDevelopmentState } from "../jobs/constants";
import { resolveDailyPipelineRunDate } from "../pipeline/run-date";
import type { RadarRepository } from "../repository/types";
import { RADAR_CLAIM_COLLISION_MESSAGE } from "./radar-partner-presentation";

/** Actions taken on a card in today's list. */
export const RADAR_PARTNER_ACTIONS = ["start", "skip", "already_known"] as const;
/** Explicit outcomes on a candidate already in development; never automatic. */
export const RADAR_PARTNER_RELEASE_ACTIONS = ["failed", "gave_up"] as const;

export type RadarPartnerAction =
  | (typeof RADAR_PARTNER_ACTIONS)[number]
  | (typeof RADAR_PARTNER_RELEASE_ACTIONS)[number];

export type ApplyRadarPartnerActionResult =
  | {
      ok: true;
      action: RadarPartnerAction;
      candidate_id: string;
      /** End of this member's own protection, for their own read model. */
      protected_until?: string;
    }
  | {
      ok: false;
      error: string;
      status: 400 | 403 | 404 | 409;
      /** Lets the UI answer a collision with fixed copy instead of an error banner. */
      code?: "candidate_unavailable";
    };

export function isRadarPartnerAction(value: string): value is RadarPartnerAction {
  return (
    (RADAR_PARTNER_ACTIONS as readonly string[]).includes(value) ||
    (RADAR_PARTNER_RELEASE_ACTIONS as readonly string[]).includes(value)
  );
}

function isReleaseAction(action: RadarPartnerAction): action is "failed" | "gave_up" {
  return (RADAR_PARTNER_RELEASE_ACTIONS as readonly string[]).includes(action);
}

export async function applyRadarPartnerAction(input: {
  repo: RadarRepository;
  member_id: string;
  candidate_id: string;
  action: RadarPartnerAction;
  now?: Date;
}): Promise<ApplyRadarPartnerActionResult> {
  const now = input.now ?? new Date();
  const config = await input.repo.getPipelineConfig();
  const rules = parseAllocationRules(config.allocation);

  if (isReleaseAction(input.action)) {
    return releaseDevelopment({
      repo: input.repo,
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      action: input.action,
      now,
      rules,
    });
  }

  const snapshot_date = resolveDailyPipelineRunDate({ now });
  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, snapshot_date);
  if (!snapshot) {
    return { ok: false, error: "今天還沒有你的推薦名單", status: 404 };
  }
  const onSnapshot = snapshot.items.some((item) => item.candidateId === input.candidate_id);
  if (!onSnapshot) {
    return { ok: false, error: "這位不在你今天的推薦名單", status: 403 };
  }

  const existing = await input.repo.getMemberCandidateState(input.member_id, input.candidate_id);
  if (input.action === "start" && existing?.development_state === "in_progress") {
    // Repeated 開始開發 on a claim they already hold: report it, write nothing.
    const held = await input.repo.getCandidateDevelopmentClaim(input.candidate_id);
    if (held && held.member_id === input.member_id && !held.released_at) {
      return {
        ok: true,
        action: input.action,
        candidate_id: input.candidate_id,
        protected_until: held.expires_at,
      };
    }
  }
  if (memberExclusion({ state: existing, now })) {
    return { ok: false, error: "這位已經不在你的待開發名單", status: 409 };
  }

  if (input.action === "skip") {
    await input.repo.setMemberCandidateState({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: null,
      excluded_from_recommendations: true,
      exclusion_reason_code: "skipped",
      skip_expires_at: skipExpiresAt({ now, rules }),
    });
    return { ok: true, action: input.action, candidate_id: input.candidate_id };
  }

  if (input.action === "already_known") {
    // Personal exclusion only: no claim, so other Partners are untouched.
    await input.repo.setMemberCandidateState({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: "already_known",
      excluded_from_recommendations: true,
      exclusion_reason_code: null,
      skip_expires_at: null,
    });
    return { ok: true, action: input.action, candidate_id: input.candidate_id };
  }

  // 開始開發 — the claim is decided by the database first. Losing it must not
  // change this member's state, and must not tell them anything about the holder.
  const window = claimWindow({ now, rules });
  const claim = await input.repo.claimCandidateDevelopment({
    candidate_id: input.candidate_id,
    member_id: input.member_id,
    expires_at: window.expires_at,
    allocatable_at: window.allocatable_at,
    rules_version: RADAR_ALLOCATION_RULES_VERSION,
    now,
  });
  if (!claim) {
    return {
      ok: false,
      error: RADAR_CLAIM_COLLISION_MESSAGE,
      status: 409,
      code: "candidate_unavailable",
    };
  }

  await input.repo.setMemberCandidateState({
    member_id: input.member_id,
    candidate_id: input.candidate_id,
    development_state: "in_progress",
    excluded_from_recommendations: true,
    exclusion_reason_code: null,
    skip_expires_at: null,
  });

  return {
    ok: true,
    action: input.action,
    candidate_id: input.candidate_id,
    protected_until: claim.expires_at,
  };
}

/**
 * failed / gave_up — a stated outcome, only from the member holding the claim.
 * Holding the claim is the authorization: a candidate in development is no
 * longer on any snapshot.
 */
async function releaseDevelopment(input: {
  repo: RadarRepository;
  member_id: string;
  candidate_id: string;
  action: "failed" | "gave_up";
  now: Date;
  rules: ReturnType<typeof parseAllocationRules>;
}): Promise<ApplyRadarPartnerActionResult> {
  const state = await input.repo.getMemberCandidateState(input.member_id, input.candidate_id);
  if (state?.development_state !== "in_progress") {
    return { ok: false, error: "這位不在你的開發中名單", status: 403 };
  }

  const allocatable_at = releaseAllocatableAt({
    released_at: input.now,
    reason: input.action,
    rules: input.rules,
  });
  const released = await input.repo.releaseCandidateDevelopmentClaim({
    candidate_id: input.candidate_id,
    member_id: input.member_id,
    released_at: input.now,
    release_reason: input.action,
    allocatable_at,
  });
  if (!released) {
    return { ok: false, error: "這位不在你的開發中名單", status: 403 };
  }

  const development_state: MemberDevelopmentState =
    input.action === "failed" ? "failed" : "gave_up";
  await input.repo.setMemberCandidateState({
    member_id: input.member_id,
    candidate_id: input.candidate_id,
    development_state,
    excluded_from_recommendations: true,
    exclusion_reason_code: null,
    skip_expires_at: null,
  });

  return { ok: true, action: input.action, candidate_id: input.candidate_id };
}
