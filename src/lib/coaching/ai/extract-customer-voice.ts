import { classifyCustomerFreeText, isFeelingClass } from "@/lib/coaching/semantics/free-text";
import type {
  CoachingCustomerVoiceKey,
  CoachingCustomerVoiceSignal,
  CoachingSignalEvidence,
} from "@/types/coaching-signals";

function evidence(
  key: string,
  value: string | number | boolean | null,
  label?: string,
): CoachingSignalEvidence {
  return label ? { key, value, label } : { key, value };
}

const RULES: Array<{ key: CoachingCustomerVoiceKey; patterns: RegExp[] }> = [
  {
    key: "hunger_reported",
    patterns: [/很餓/, /還是會餓/, /容易餓/, /肚子餓/, /好餓/, /餓了/, /飢餓/, /不夠飽/, /一下就餓/],
  },
  {
    key: "sweet_craving_reported",
    patterns: [/想吃甜/, /嘴饞/, /想吃糖/, /想喝含糖/, /甜食/],
  },
  {
    key: "low_appetite_reported",
    patterns: [/沒胃口/, /吃不下/, /沒什麼食慾/, /不想吃/],
  },
  {
    key: "fatigue_reported",
    patterns: [/好累/, /很累/, /疲倦/, /沒精神/, /乏力/],
  },
  {
    key: "late_night_eating_reported",
    patterns: [/宵夜/, /半夜吃/, /很晚才吃/, /深夜吃/],
  },
  {
    key: "emotional_eating_reported",
    patterns: [/壓力大.*吃/, /情緒.*吃/, /心情不好.*吃/, /悶.*吃/],
  },
  {
    key: "difficulty_following_plan",
    patterns: [/做不到/, /跟不上/, /很難執行/, /計畫太難/, /沒辦法照/],
  },
];

/**
 * Deterministic Customer Voice extraction from free-text customer_note.
 * High-weight: if present, Daily Coach must acknowledge.
 */
export function extractCustomerVoiceSignals(customerNote: string | null | undefined): CoachingCustomerVoiceSignal[] {
  const note = customerNote?.trim() ?? "";
  if (!note) {
    return [];
  }

  const matched: CoachingCustomerVoiceSignal[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(note))) {
      matched.push({
        key: rule.key,
        rawExcerpt: note.slice(0, 80),
        evidence: [evidence("customer_note", note), evidence("voice_key", rule.key)],
      });
    }
  }

  if (matched.length === 0) {
    const classified = classifyCustomerFreeText(note);
    // Facts / questions / ambiguous notes are not customer "concerns".
    if (classified && isFeelingClass(classified.class)) {
      matched.push({
        key: "other_customer_concern",
        rawExcerpt: note.slice(0, 80),
        evidence: [evidence("customer_note", note), evidence("voice_key", "other_customer_concern")],
      });
    }
  }

  return matched;
}
