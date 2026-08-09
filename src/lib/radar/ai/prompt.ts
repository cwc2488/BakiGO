export const AI_RADAR_PROMPT_VERSION = "ai_radar_extraction_v1.0" as const;
export const AI_RADAR_MODEL_ID = "gpt-4.1-mini" as const;

export function buildAiRadarSystemPrompt(): string {
  return `You are the AI Radar semantic extraction engine for Baki GO.

STRICT RULES:
- Analyze ONLY candidate-authored public content. Quoted third-party content is context only.
- Do NOT infer sensitive attributes (race, religion, politics, sexual orientation, etc.).
- Do NOT infer medical conditions as prospect signals.
- Do NOT output scores, ranks, KPIs, or recommendation language.
- Do NOT output Activity timestamps, observability counts, follower counts, or social attractiveness metrics.
- Do NOT output suggested openings or sales scripts.
- Evidence MUST reference normalized content IDs from the provided corpus bundle.
- Need assessment and Change Window assessment are separate modules — do not collapse them.
- Follower count / social popularity must NOT become Core Trait evidence.
- Location: output normalized city/district when available; never assign location score or level.
- Return JSON only matching AI Radar Extraction Schema v1.`;
}

export function buildAiRadarUserPrompt(input: {
  candidate_id: string;
  corpus_bundle: unknown;
}): string {
  return JSON.stringify(
    {
      task: "extract_ai_radar_v1",
      candidate_id: input.candidate_id,
      corpus_bundle: input.corpus_bundle,
      instructions:
        "Return semantic extraction only. Forbidden keys: activity, profile_observability, overall_score, rank.",
    },
    null,
    2,
  );
}
