import {
  COACHING_AI_V2_INTENTIONS,
  type CoachingAiV2Intention,
} from "@/types/coaching-ai-v2";

const CANONICAL = new Set<string>(COACHING_AI_V2_INTENTIONS);

/**
 * Synonyms / V3 conversational labels → canonical internal intention.
 * Source of truth for allowed stored values remains COACHING_AI_V2_INTENTIONS.
 */
export const COACHING_AI_V2_INTENTION_ALIASES: Record<string, CoachingAiV2Intention> = {
  // V3 principle vocabulary (EN)
  confirm: "acknowledge",
  confirmation: "acknowledge",
  affirm: "acknowledge",
  validate: "acknowledge",
  validation: "acknowledge",
  empathize: "acknowledge",
  empathy: "acknowledge",
  listen: "observe",
  listening: "observe",
  notice: "observe",
  noticing: "observe",
  ask: "investigate",
  question: "investigate",
  curious: "investigate",
  curiosity: "investigate",
  clarify: "investigate",
  clarification: "investigate",
  coach: "educate",
  coaching: "educate",
  teach: "educate",
  teaching: "educate",
  correct: "educate",
  correction: "educate",
  support: "encourage",
  cheer: "encourage",
  celebrate: "reinforce",
  wait: "casual",
  minimal: "casual",
  silence: "casual",
  hold: "casual",
  humor: "casual",
  joke: "casual",
  chat: "casual",
  relate: "casual",
  share: "casual",
  connect: "casual",
  // V3 principle vocabulary (ZH from prompt)
  確認: "acknowledge",
  觀察: "observe",
  好奇: "investigate",
  教練: "educate",
  鼓勵: "encourage",
  澄清: "investigate",
  糾正: "educate",
  // Common punctuation variants
  "follow-up": "follow_up",
  followup: "follow_up",
  "test-hypothesis": "test_hypothesis",
  testhypothesis: "test_hypothesis",
  "detect-risk": "detect_risk",
  detectrisk: "detect_risk",
};

export const COACHING_AI_V2_INTENTION_FALLBACK: CoachingAiV2Intention = "casual";

function canonicalizeRawLabel(raw: string): string {
  return raw
    .trim()
    .replace(/[\s]+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

/**
 * Normalize noncritical coaching-move metadata.
 * Unknown safe moves fall back to a neutral canonical value.
 * Safety/escalation remain strict when those flags are set.
 */
export function normalizeCoachingAiV2Intention(input: {
  raw: unknown;
  safetyTriggered?: boolean;
  escalationSuggested?: boolean;
}): {
  intention: CoachingAiV2Intention;
  normalized: boolean;
  raw: string | null;
  reason: "canonical" | "alias" | "fallback" | "safety_override";
} {
  const raw =
    typeof input.raw === "string"
      ? input.raw.trim()
      : input.raw == null
        ? null
        : String(input.raw).trim();

  if (input.safetyTriggered || input.escalationSuggested) {
    if (raw && (raw === "escalate" || canonicalizeRawLabel(raw) === "escalate")) {
      return { intention: "escalate", normalized: raw !== "escalate", raw, reason: "safety_override" };
    }
    if (raw && (raw === "detect_risk" || canonicalizeRawLabel(raw) === "detect_risk")) {
      return {
        intention: "detect_risk",
        normalized: raw !== "detect_risk",
        raw,
        reason: "safety_override",
      };
    }
    // Safety path must not invent escalate from unknown labels.
    const forced: CoachingAiV2Intention = input.escalationSuggested ? "escalate" : "detect_risk";
    return {
      intention: forced,
      normalized: true,
      raw,
      reason: "safety_override",
    };
  }

  if (!raw) {
    return {
      intention: COACHING_AI_V2_INTENTION_FALLBACK,
      normalized: true,
      raw: null,
      reason: "fallback",
    };
  }

  if (CANONICAL.has(raw)) {
    return {
      intention: raw as CoachingAiV2Intention,
      normalized: false,
      raw,
      reason: "canonical",
    };
  }

  const key = canonicalizeRawLabel(raw);
  if (CANONICAL.has(key)) {
    return {
      intention: key as CoachingAiV2Intention,
      normalized: key !== raw,
      raw,
      reason: "alias",
    };
  }

  const aliased = COACHING_AI_V2_INTENTION_ALIASES[raw] ?? COACHING_AI_V2_INTENTION_ALIASES[key];
  if (aliased) {
    return { intention: aliased, normalized: true, raw, reason: "alias" };
  }

  return {
    intention: COACHING_AI_V2_INTENTION_FALLBACK,
    normalized: true,
    raw,
    reason: "fallback",
  };
}

export function logCoachingAiV2MoveNormalized(input: {
  raw: string | null;
  intention: CoachingAiV2Intention;
  reason: string;
}): void {
  console.info(
    JSON.stringify({
      event: "go21_chat_diagnostic",
      stage: "generation",
      move_normalized: true,
      intention_raw: input.raw ? String(input.raw).slice(0, 40) : null,
      intention: input.intention,
      reason: input.reason,
    }),
  );
}
