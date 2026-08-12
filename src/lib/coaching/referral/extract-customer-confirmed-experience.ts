/**
 * Deterministic, conservative customer-confirmed experience extraction.
 * Eligibility authority — not unrestricted GPT classification.
 * Prefer false negatives over false positives.
 *
 * Contract: pass Customer-authored text only (customer_note / portal note).
 * Do NOT pass Coach notes, AI prose, or photo captions as authority.
 */
import type { CustomerConfirmedExperience, CustomerConfirmedExperienceClass } from "@/types/coaching-referral";

type Rule = {
  class: CustomerConfirmedExperienceClass;
  id: string;
  patterns: RegExp[];
};

/** Reject third-person / coach-opinion / AI-narration framing even if a positive phrase appears. */
const NON_CUSTOMER_VOICE_GUARDS: RegExp[] = [
  /我覺得她/,
  /我覺得他/,
  /她看起來/,
  /他看起來/,
  /看起來對成果/,
  /看起來對.*滿意/,
  /我觀察到/,
  /教練覺得/,
  /AI[：:]/,
  /照片看起來/,
  /看起來變瘦/,
];

/** Highest priority first. */
const RULES: Rule[] = [
  {
    class: "explicit_struggle",
    id: "no_effect",
    patterns: [
      /沒有感覺有效果/,
      /沒感覺有效果/,
      /完全沒效果/,
      /沒有用/,
      /沒效果/,
      /沒有改善/,
      /沒改善/,
      /想放棄/,
      /很挫折/,
      /好挫折/,
      /無效/,
    ],
  },
  {
    class: "explicit_referral_intent",
    id: "friend_wants_try",
    patterns: [
      /朋友也想試/,
      /朋友想試試看/,
      /朋友也想試試看/,
      /我想介紹朋友/,
      /想介紹給朋友/,
      /介紹朋友/,
      /推薦給朋友/,
      /朋友也有這個需求/,
      /朋友也有.*需求/,
      /我朋友也想/,
      /朋友對這很有興趣/,
    ],
  },
  {
    class: "explicit_satisfaction",
    id: "explicit_satisfaction",
    patterns: [/真的很滿意/, /非常滿意/, /超滿意/, /很滿意/, /太滿意了/],
  },
  {
    class: "explicit_positive_experience",
    id: "explicit_positive_experience",
    patterns: [
      /真的覺得精神改善很多/,
      /精神改善很多/,
      /精神好多了/,
      /明顯有感/,
      /真的有感/,
      /感受到改善/,
      /明顯改善/,
      /真的有進步/,
      /明顯進步/,
      /衣服明顯變鬆/,
    ],
  },
  {
    class: "implicit_positive",
    id: "vague_positive",
    patterns: [/感覺還不錯/, /還不錯/, /還可以/, /還好/, /感覺不錯/, /好像有點用/, /似乎有改善/],
  },
];

const PATH_B_CLASSES = new Set<CustomerConfirmedExperienceClass>([
  "explicit_positive_experience",
  "explicit_satisfaction",
  "explicit_referral_intent",
]);

/**
 * Extract from Customer-authored text only (customer_note / portal note).
 * Do NOT pass Coach notes or AI prose.
 */
export function extractCustomerConfirmedExperience(
  customerNote: string | null | undefined,
): CustomerConfirmedExperience {
  const note = customerNote?.trim() ?? "";
  if (!note) {
    return { class: "none", matchedPatterns: [], rawExcerpt: null, qualifiesPathB: false };
  }

  if (NON_CUSTOMER_VOICE_GUARDS.some((pattern) => pattern.test(note))) {
    return {
      class: "none",
      matchedPatterns: ["non_customer_voice_guard"],
      rawExcerpt: note.slice(0, 120),
      qualifiesPathB: false,
    };
  }

  for (const rule of RULES) {
    const hit = rule.patterns.find((pattern) => pattern.test(note));
    if (hit) {
      return {
        class: rule.class,
        matchedPatterns: [rule.id],
        rawExcerpt: note.slice(0, 120),
        qualifiesPathB: PATH_B_CLASSES.has(rule.class),
      };
    }
  }

  return { class: "none", matchedPatterns: [], rawExcerpt: note.slice(0, 120), qualifiesPathB: false };
}
