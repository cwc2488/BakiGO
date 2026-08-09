import type { NeedRelevanceLevel, RelevanceEvidenceQuality } from "./need-types";

const RELEVANCE_RANK: Record<NeedRelevanceLevel, number> = {
  unrelated: 0,
  adjacent: 1,
  relevant: 2,
  high_fit: 3,
};

export type RelevanceCeilingViolation = {
  path: string;
  message: string;
};

export function exceedsRelevanceCeiling(
  relevance: NeedRelevanceLevel,
  ceiling: NeedRelevanceLevel,
): boolean {
  return RELEVANCE_RANK[relevance] > RELEVANCE_RANK[ceiling];
}

/**
 * Policy Ceiling + Evidence Exception (fit_policy_v1):
 * - adjacent ceiling → max adjacent
 * - relevant default → may upgrade to high_fit only with direct explicit evidence
 * - high_fit ceiling → max high_fit
 */
export function validateNeedRelevanceAgainstPolicy(input: {
  need_type: string;
  relevance: NeedRelevanceLevel;
  relevance_evidence_quality?: RelevanceEvidenceQuality;
  default_relevance: NeedRelevanceLevel;
  relevance_ceiling: NeedRelevanceLevel;
  path: string;
}): RelevanceCeilingViolation | null {
  const {
    relevance,
    relevance_evidence_quality,
    default_relevance,
    relevance_ceiling,
    path,
  } = input;

  if (exceedsRelevanceCeiling(relevance, relevance_ceiling)) {
    return {
      path,
      message: `relevance "${relevance}" exceeds policy ceiling "${relevance_ceiling}" for need_type`,
    };
  }

  if (
    default_relevance === "relevant" &&
    relevance === "high_fit" &&
    relevance_evidence_quality !== "direct"
  ) {
    return {
      path,
      message:
        "high_fit requires relevance_evidence_quality=direct when policy default_relevance is relevant",
    };
  }

  if (
    default_relevance === "adjacent" &&
    (relevance === "relevant" || relevance === "high_fit")
  ) {
    return {
      path,
      message: `relevance "${relevance}" forbidden for adjacent-default need_type — use a more specific need or lower relevance`,
    };
  }

  return null;
}

/** Inferred medical content must not support health_management need scoring. */
const HEALTH_MANAGEMENT_INFERENCE_PATTERNS = [
  /診斷/,
  /確診/,
  /疾病/,
  /病況/,
  /檢查(?:報告|結果).*(?:顯示|發現|指出)/,
  /(?:血糖|血壓|膽固醇|HbA1c|糖尿病|高血壓)/,
  /inferred/i,
  /diagnos/i,
  /medical condition/i,
];

export function validateHealthManagementEvidence(input: {
  reasoning: string;
  path: string;
}): RelevanceCeilingViolation | null {
  for (const pattern of HEALTH_MANAGEMENT_INFERENCE_PATTERNS) {
    if (pattern.test(input.reasoning)) {
      return {
        path: input.path,
        message:
          "health_management must use Candidate-stated wellness goals only — inferred medical conditions are forbidden",
      };
    }
  }
  return null;
}

export function validateUmbrellaNeedExclusion(input: {
  items: Array<{ need_type: string }>;
}): RelevanceCeilingViolation | null {
  const hasUmbrella = input.items.some(
    (n) => n.need_type === "personal_growth_life_change",
  );
  const hasSpecific = input.items.some(
    (n) => n.need_type !== "personal_growth_life_change",
  );

  if (hasUmbrella && hasSpecific) {
    return {
      path: "needs.items",
      message:
        "personal_growth_life_change cannot appear in scored needs[] when a more specific need exists — use advisory.umbrella_need_tags instead",
    };
  }

  return null;
}
