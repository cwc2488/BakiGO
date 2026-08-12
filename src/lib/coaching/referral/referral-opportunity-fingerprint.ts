import { createHash } from "node:crypto";
import type { OutcomeSignal, ReferralOpportunityEvaluation } from "@/types/coaching-referral";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function buildReferralOpportunityFingerprint(input: {
  outcomeSignal: OutcomeSignal;
  pathway: ReferralOpportunityEvaluation["pathway"];
  readiness: ReferralOpportunityEvaluation["readiness"];
}): string {
  const signal = input.outcomeSignal;
  const snapshot = {
    customerId: signal.customerId,
    enrollmentId: signal.enrollmentId,
    pathway: input.pathway,
    readiness: input.readiness,
    outcomeStatus: signal.outcomeStatus,
    measurementStage: signal.measurementStage,
    bodyQualityFlags: [...signal.bodyQualityFlags].sort(),
    customerConfirmedClass: signal.customerConfirmed.class,
    confirmedPatterns: [...signal.customerConfirmed.matchedPatterns].sort(),
    latestMeasurementId: signal.latestMeasurementId,
    baselineMeasurementId: signal.baselineMeasurementId,
  };
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}
