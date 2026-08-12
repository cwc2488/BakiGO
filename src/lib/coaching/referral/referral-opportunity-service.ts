/** @deprecated Phase 4e — use growth-opportunity-service. Re-export for compatibility. */
export {
  listGrowthOpportunitiesForEnrollment as listReferralOpportunitiesForEnrollment,
  persistGrowthMatrixEvaluation as reconcileReferralOpportunityForEnrollment,
  updateGrowthOpportunityStatus as updateReferralOpportunityStatus,
} from "@/lib/coaching/growth/growth-opportunity-service";
