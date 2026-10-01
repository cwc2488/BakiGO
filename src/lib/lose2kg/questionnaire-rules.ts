/**
 * Pure deterministic questionnaire segmentation rules (no DB / no server imports).
 */

import type {
  Lose2kgBusinessInterest,
  Lose2kgConsultationInterest,
  Lose2kgDesiredHelp,
  Lose2kgIncomeInterest,
  Lose2kgProductInterest,
  Lose2kgQuestionnaireResultRow,
  Lose2kgQuestionnaireSegment,
} from "@/types/lose2kg";

export function isProductHigh(response: {
  productInterest: Lose2kgProductInterest;
  desiredHelp: Lose2kgDesiredHelp[];
}): boolean {
  return (
    response.productInterest === "know_what" ||
    response.productInterest === "interested_need_guidance" ||
    response.desiredHelp.includes("product_pairing") ||
    response.desiredHelp.includes("coach_support")
  );
}

export function isBusinessInterested(response: {
  businessInterest: Lose2kgBusinessInterest;
  incomeInterest: Lose2kgIncomeInterest;
}): boolean {
  return (
    response.businessInterest === "very_interested" ||
    response.incomeInterest === "willing_to_learn"
  );
}

export function wantsConsultation(response: {
  consultationInterest: Lose2kgConsultationInterest;
}): boolean {
  return (
    response.consultationInterest === "yes" ||
    response.consultationInterest === "contact_later"
  );
}

export function matchesQuestionnaireSegment(
  row: Lose2kgQuestionnaireResultRow,
  segment: Lose2kgQuestionnaireSegment,
): boolean {
  switch (segment) {
    case "all":
      return true;
    case "pending":
      return !row.hasResponse;
    case "consultation":
      return row.wantsConsultation;
    case "product_high":
      return row.productHigh;
    case "business_interest":
      return row.businessInterested;
    case "product_and_business":
      return row.productHigh && row.businessInterested;
    case "no_demand":
      return (
        row.hasResponse &&
        !row.productHigh &&
        !row.businessInterested &&
        !row.wantsConsultation
      );
    default:
      return true;
  }
}
