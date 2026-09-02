/**
 * Radar V1 daily-pipeline seed — SCALE-03 retained topic nouns only.
 *
 * Phrase Inventory V1 remains the definition source.
 * `radar_system_keywords` remains the daily-pipeline DB source of truth.
 * First-person phrases and blocked Meta terms are not activated.
 */

import {
  experimentArmATopicNouns,
  type NeedFamily,
  type PhraseInventoryEntry,
} from "./phrase-inventory-v1";

export const RADAR_V1_SYSTEM_KEYWORD_SEED_VERSION = "radar_v1_scale03_topic_nouns" as const;

export type RadarSystemKeywordSeedRow = {
  phrase: string;
  discovery_intent:
    | "body_transformation"
    | "health_improvement"
    | "income_need"
    | "career_business_change";
  signal_type: "broad_need";
  discovery_weight: number;
  locale: "zh-TW";
  is_active: true;
};

const NEED_FAMILY_TO_INTENT: Record<
  NeedFamily,
  RadarSystemKeywordSeedRow["discovery_intent"]
> = {
  body_fat: "body_transformation",
  muscle_fitness: "body_transformation",
  health_improve: "health_improvement",
  side_income: "income_need",
  money_change: "career_business_change",
};

function toSeedRow(entry: PhraseInventoryEntry): RadarSystemKeywordSeedRow {
  return {
    phrase: entry.phrase,
    discovery_intent: NEED_FAMILY_TO_INTENT[entry.need_family],
    signal_type: "broad_need",
    discovery_weight: 1,
    locale: "zh-TW",
    is_active: true,
  };
}

/** Active system keywords the daily pipeline must receive after seed. */
export function radarV1SystemKeywordSeed(): RadarSystemKeywordSeedRow[] {
  return experimentArmATopicNouns().map(toSeedRow);
}

export function radarV1SeededPhrases(): string[] {
  return radarV1SystemKeywordSeed().map((row) => row.phrase);
}

/** Shape `loadKeywordsByMember` attaches to every member from system defaults. */
export function radarV1SystemKeywordsForPipeline(idPrefix = "sys"): Array<{
  keyword_id: string;
  phrase: string;
  discovery_weight: number;
}> {
  return radarV1SystemKeywordSeed().map((row, index) => ({
    keyword_id: `${idPrefix}-${index + 1}`,
    phrase: row.phrase,
    discovery_weight: row.discovery_weight,
  }));
}
