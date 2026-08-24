import { CORE_TRAIT_IDS } from "../extraction/constants";
import { NEED_TYPE_DEFINITIONS, NEED_TYPE_SLUGS, UMBRELLA_NEED_TYPE } from "../fit-policy";

/**
 * v1.1 states the fit-policy relevance ceilings, the required core trait ids and
 * the evidence-id contract that Extraction v1 has always validated. Extraction
 * Schema v1 and the scoring policy are unchanged; only the instructions the
 * model receives are aligned with them.
 */
export const AI_RADAR_PROMPT_VERSION = "ai_radar_extraction_v1.1" as const;
export const AI_RADAR_MODEL_ID = "gpt-4.1-mini" as const;

function buildFitPolicyTable(): string {
  return NEED_TYPE_SLUGS.map((slug) => {
    const entry = NEED_TYPE_DEFINITIONS[slug];
    const umbrella = entry.is_umbrella ? ", umbrella" : "";
    return `- ${slug}: default_relevance=${entry.default_relevance}, max_relevance=${entry.relevance_ceiling}${umbrella}`;
  }).join("\n");
}

export function buildAiRadarSystemPrompt(): string {
  return `You are the AI Radar semantic extraction engine for Baki GO.

Judge only candidate-authored public content. Quoted third-party content is context only.
Reason across the recent corpus as a whole. Do not classify from one keyword or isolated sentence when broader evidence exists.

HOW TO JUDGE:
- Needs and Change Window are separate modules. Do not collapse them.
- Change Window: change intent, behavioral change already underway, and whether a solution gap remains.
- Needs: only types defined by fit policy; omit undetected needs rather than inventing them.
- Urgency / why-now belongs in reasoning when the public content actually shows it.
- Ambition or business signals only when the candidate's own expression supports them.
- Contactability: natural entry and interaction openness from public expression, not popularity.
- Core traits: evidence events from candidate-authored content only. Follower count and social attractiveness are not trait evidence.
- Location: normalize city/district only when the public content supports it. Do not invent a home address.

NEEDS / FIT POLICY RELEVANCE CEILINGS (fit_policy_v1):
${buildFitPolicyTable()}
- relevance must never exceed max_relevance for that need_type.
- When default_relevance is adjacent, relevance must stay adjacent.
- When default_relevance is relevant, high_fit additionally requires relevance_evidence_quality=direct.
- ${UMBRELLA_NEED_TYPE} is the umbrella need: if any more specific need is detected, keep it out of needs.items and report it in advisory.umbrella_need_tags instead.
- Never output a need with strength "none": omit undetected needs; an empty items array means no needs detected.

CORE TRAITS:
- Output exactly one entry for each of these trait ids, no duplicates and nothing else: ${CORE_TRAIT_IDS.join(", ")}.
- A trait with no supporting evidence keeps an empty evidence_events array. Do not omit the trait and do not reuse another trait's events.

EVIDENCE IDENTIFIERS:
- Every source_refs[].content_id MUST be copied verbatim from allowed_source_ref_content_ids in the user message.
- Never construct, hash, shorten or invent an identifier, and never cite content that is not in the corpus bundle.
- An assessment with availability "available" requires at least one source_ref, including when its level is "none".
- location availability "available" requires a normalized_city or normalized_district plus a source_ref.

HARD LIMITS:
- Do not infer sensitive attributes (race, religion, politics, sexual orientation).
- Do not infer medical conditions as prospect signals.
- Do not output scores, ranks, KPIs, recommendation language, suggested openings, or sales scripts.
- Do not output Activity timestamps, observability counts, or follower counts.
- If evidence is insufficient, mark that module availability as unknown.`;
}

export function buildAiRadarUserPrompt(input: {
  candidate_id: string;
  corpus_bundle: unknown;
  allowed_source_ref_content_ids: string[];
  repair?: { issues: string[] };
}): string {
  return JSON.stringify(
    {
      task: input.repair ? "repair_ai_radar_v1" : "extract_ai_radar_v1",
      candidate_id: input.candidate_id,
      corpus_bundle: input.corpus_bundle,
      allowed_source_ref_content_ids: input.allowed_source_ref_content_ids,
      ...(input.repair
        ? {
            previous_attempt_rejected_because: input.repair.issues,
            repair_instructions:
              "Re-extract from the same corpus_bundle and fix only the listed contract violations. Do not add findings the evidence does not support; prefer availability unknown over an unsupported claim.",
          }
        : {}),
      instructions:
        "Extract semantic signals from this candidate's analyzable public content. Structured output schema is provided by the API, not by this prompt.",
    },
    null,
    2,
  );
}
