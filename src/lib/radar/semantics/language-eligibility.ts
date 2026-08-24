import type { CandidateContentCorpus } from "../normalization/schema";
import type {
  PrimaryLanguage,
  TraditionalChineseUsable,
} from "./candidate-understanding";

/**
 * Cheap script-level language evidence. Not a regex keyword filter: counts
 * writing systems across the recent corpus, then decides developability for
 * Taiwan Traditional-Chinese partners.
 */

const HIRAGANA = /[\u3040-\u309F]/g;
const KATAKANA = /[\u30A0-\u30FF]/g;
const HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF]/g;
const HAN = /[\u4E00-\u9FFF]/g;
const LATIN = /[A-Za-z]/g;

/** Characters that are Simplified-only in common body text (not a nationality test). */
const SIMPLIFIED_ONLY = /[这们过吗对为会学国现时发说经总还进着从么个后与里体机动点实来写]/g;
/** Characters that are Traditional-only in common body text. */
const TRADITIONAL_ONLY = /[這們過嗎對為會學國現時發說經總還進著從麼個後與裡體機動點實來寫]/g;

export type LanguageClassification = {
  primary_language: PrimaryLanguage;
  traditional_chinese_usable: TraditionalChineseUsable;
  confidence: "high" | "medium" | "low";
  counts: {
    han: number;
    hiragana: number;
    katakana: number;
    hangul: number;
    latin: number;
    traditional_only: number;
    simplified_only: number;
  };
};

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function classifyTextLanguage(text: string): LanguageClassification {
  const han = countMatches(text, HAN);
  const hiragana = countMatches(text, HIRAGANA);
  const katakana = countMatches(text, KATAKANA);
  const hangul = countMatches(text, HANGUL);
  const latin = countMatches(text, LATIN);
  const traditional_only = countMatches(text, TRADITIONAL_ONLY);
  const simplified_only = countMatches(text, SIMPLIFIED_ONLY);
  const kana = hiragana + katakana;
  const cjk = han + kana + hangul;
  const total = cjk + latin;
  const counts = {
    han,
    hiragana,
    katakana,
    hangul,
    latin,
    traditional_only,
    simplified_only,
  };

  if (total < 12) {
    return {
      primary_language: "unknown",
      traditional_chinese_usable: "uncertain",
      confidence: "low",
      counts,
    };
  }

  if (hangul >= 20 && hangul > han * 2 && hangul > kana) {
    return {
      primary_language: "ko",
      traditional_chinese_usable: "false",
      confidence: hangul >= 40 ? "high" : "medium",
      counts,
    };
  }

  if (kana >= 16 && kana > hangul && (kana > han * 0.35 || han < 20)) {
    return {
      primary_language: "ja",
      traditional_chinese_usable: "false",
      confidence: kana >= 28 ? "high" : "medium",
      counts,
    };
  }

  if (latin >= 40 && han < 8 && kana < 4 && hangul < 4) {
    return {
      primary_language: "en",
      traditional_chinese_usable: "false",
      confidence: latin >= 80 ? "high" : "medium",
      counts,
    };
  }

  if (han >= 12 && han >= kana && han >= hangul) {
    const scriptHint = traditional_only + simplified_only;
    const traditionalShare = scriptHint === 0 ? 0.5 : traditional_only / scriptHint;
    const substantialHant = han >= 24 && (traditionalShare >= 0.55 || traditional_only >= 4);
    const substantialHans = simplified_only >= 6 && traditionalShare <= 0.35;

    if (kana >= 12 && kana >= han * 0.4) {
      return {
        primary_language: "mixed",
        traditional_chinese_usable: substantialHant ? "true" : "false",
        confidence: "medium",
        counts,
      };
    }

    if (substantialHans && !substantialHant) {
      return {
        primary_language: "zh-Hans",
        traditional_chinese_usable: "false",
        confidence: simplified_only >= 10 ? "high" : "medium",
        counts,
      };
    }

    // Taiwan V1: Han-dominant text without substantial Simplified evidence is
    // developable Traditional Chinese. Occasional kana/Latin does not flip this.
    if (!substantialHans && hangul < 8 && kana < 12) {
      return {
        primary_language: "zh-Hant",
        traditional_chinese_usable: "true",
        confidence: han >= 40 || traditional_only >= 4 ? "high" : "medium",
        counts,
      };
    }

    if (substantialHant) {
      return {
        primary_language: "zh-Hant",
        traditional_chinese_usable: "true",
        confidence: han >= 40 || traditional_only >= 8 ? "high" : "medium",
        counts,
      };
    }

    return {
      primary_language: "mixed",
      traditional_chinese_usable: traditional_only >= 3 || (han >= 24 && !substantialHans)
        ? "true"
        : "uncertain",
      confidence: "medium",
      counts,
    };
  }

  if (latin >= 20) {
    return {
      primary_language: "en",
      traditional_chinese_usable: "false",
      confidence: "medium",
      counts,
    };
  }

  return {
    primary_language: "unknown",
    traditional_chinese_usable: "uncertain",
    confidence: "low",
    counts,
  };
}

export function classifyCorpusLanguage(
  corpus: Pick<CandidateContentCorpus, "items">,
): LanguageClassification {
  const text = corpus.items
    .filter((item) => item.is_analyzable)
    .map((item) => `${item.candidate_commentary_text ?? ""} ${item.text ?? ""}`)
    .join("\n");
  return classifyTextLanguage(text);
}

/** Confident foreign-language corpora skip expensive analysis. Mixed/unknown still go to the model. */
export function shouldSkipExpensiveAnalysis(classification: LanguageClassification): boolean {
  if (classification.traditional_chinese_usable === "true") return false;
  if (
    classification.primary_language === "ja" ||
    classification.primary_language === "ko" ||
    classification.primary_language === "en" ||
    classification.primary_language === "zh-Hans"
  ) {
    return classification.confidence === "high" || classification.confidence === "medium";
  }
  return false;
}
