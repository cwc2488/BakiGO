import {
  REFERRAL_OPPORTUNITY_POLICY,
  type ReferralOpportunityEvaluation,
  type ReferralOpportunityRecord,
  type ReferralOpportunityStatus,
} from "@/types/coaching-referral";

export type ReferralOpportunityReconcilePlan =
  | { action: "noop"; reason: string }
  | {
      action: "insert";
      readiness: "emerging" | "strong";
      fingerprint: string;
      status: "open";
      expiresAt: string;
    }
  | {
      action: "update";
      opportunityId: string;
      readiness: "emerging" | "strong";
      fingerprint: string;
      status: ReferralOpportunityStatus;
      expiresAt: string | null;
    }
  | {
      action: "supersede";
      previousOpportunityId: string;
      readiness: "emerging" | "strong";
      fingerprint: string;
      status: "open";
      expiresAt: string;
    };

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/**
 * Deterministic persistence plan — no daily insert for same fingerprint.
 */
export function planReferralOpportunityReconciliation(input: {
  evaluation: ReferralOpportunityEvaluation;
  existing: ReferralOpportunityRecord[];
  asOfIso: string;
}): ReferralOpportunityReconcilePlan {
  const { evaluation, existing, asOfIso } = input;
  if (!evaluation.shouldOpen) {
    return { action: "noop", reason: "not_eligible_or_blocked" };
  }
  if (evaluation.readiness !== "emerging" && evaluation.readiness !== "strong") {
    return { action: "noop", reason: "readiness_not_openable" };
  }

  const sameFingerprint = existing
    .filter((row) => row.fingerprint === evaluation.fingerprint)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  if (sameFingerprint) {
    if (sameFingerprint.status === "open" || sameFingerprint.status === "snoozed") {
      return {
        action: "update",
        opportunityId: sameFingerprint.id,
        readiness: evaluation.readiness,
        fingerprint: evaluation.fingerprint,
        status: sameFingerprint.status === "snoozed" ? "snoozed" : "open",
        expiresAt:
          sameFingerprint.expiresAt ??
          addMs(asOfIso, REFERRAL_OPPORTUNITY_POLICY.defaultExpiresMs),
      };
    }
    // acted/declined/expired with same fingerprint during cooldown already blocked in evaluate
    return { action: "noop", reason: `same_fingerprint_status_${sameFingerprint.status}` };
  }

  const openOther = existing
    .filter((row) => row.status === "open")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const expiresAt = addMs(asOfIso, REFERRAL_OPPORTUNITY_POLICY.defaultExpiresMs);

  if (openOther && openOther.fingerprint !== evaluation.fingerprint) {
    return {
      action: "supersede",
      previousOpportunityId: openOther.id,
      readiness: evaluation.readiness,
      fingerprint: evaluation.fingerprint,
      status: "open",
      expiresAt,
    };
  }

  return {
    action: "insert",
    readiness: evaluation.readiness,
    fingerprint: evaluation.fingerprint,
    status: "open",
    expiresAt,
  };
}
