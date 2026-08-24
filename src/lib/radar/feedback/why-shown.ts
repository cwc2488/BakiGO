import type { AiRadarExtractionV1 } from "../extraction/schema";
import { pickPartnerWhyLines } from "../semantics/recommendation-reason";

/**
 * Same why-line selection used on the Partner card, without UI clipping.
 * Frozen into evaluation_context so later reanalyze cannot rewrite history.
 */
export function whyFromExtractionForFeedback(extraction: AiRadarExtractionV1): string[] {
  const understanding = extraction.candidate_understanding;
  const fallback: string[] = [];
  const intent = extraction.change_window.change_intent;
  if (intent.availability === "available" && intent.source_refs.length > 0 && intent.reasoning.trim()) {
    fallback.push(intent.reasoning.trim());
  }
  if (extraction.needs.availability === "available") {
    const evidenced = extraction.needs.items.find(
      (item) => item.strength !== "none" && item.source_refs.length > 0 && item.reasoning.trim(),
    );
    if (evidenced) fallback.push(evidenced.reasoning.trim());
  }

  return pickPartnerWhyLines({
    recommendation_reason_zh: understanding?.recommendation_reason_zh ?? null,
    advisory_reasons: extraction.advisory?.recommendation_reasons,
    fallback_reasons: fallback,
    need_owner: understanding?.need_owner,
  });
}
