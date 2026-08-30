/**
 * Hard safety boundaries for AI Coach V2.
 * Targeted — does not force generic responses during ordinary coaching.
 */

export type CoachingAiV2SafetyAssessment = {
  triggered: boolean;
  escalate: boolean;
  reasons: string[];
  safeReply: string | null;
};

const MEDICAL_PATTERNS =
  /(診斷|糖尿病|癌症|心臟病|中風|自殺|自殘|厭食|暴食|催吐|瀉藥|不吃東西.*減肥|極端斷食|醫生說|開藥|處方|急救|暈倒|吐血)/u;

const HELP_HUMAN_PATTERNS = /(找(真人|人類)?教練|真人教練|想跟教練(講|談)|需要人工|請教練幫忙)/u;

export function assessCoachingAiV2Safety(input: {
  customerNote?: string | null;
  freeMessage?: string | null;
  mealNotes?: string[];
}): CoachingAiV2SafetyAssessment {
  const blob = [input.customerNote, input.freeMessage, ...(input.mealNotes ?? [])]
    .filter(Boolean)
    .join("\n");

  const reasons: string[] = [];
  let triggered = false;
  let escalate = false;
  let safeReply: string | null = null;

  if (!blob.trim()) {
    return { triggered: false, escalate: false, reasons: [], safeReply: null };
  }

  if (MEDICAL_PATTERNS.test(blob)) {
    triggered = true;
    escalate = true;
    reasons.push("medical_or_high_risk_language");
    safeReply =
      "你提到的狀況超出我能安全處理的範圍。我不會做醫療診斷或給危險建議。請先以專業醫療／真人教練為準；我也會標註請教練關注。";
  }

  if (HELP_HUMAN_PATTERNS.test(blob)) {
    escalate = true;
    reasons.push("explicit_human_coach_request");
    if (!safeReply) {
      safeReply =
        "好，我幫你標註給真人教練。你可以先跟我說最想讓教練知道的重點，我不會假裝自己能取代教練。";
    }
  }

  return { triggered, escalate, reasons, safeReply };
}
