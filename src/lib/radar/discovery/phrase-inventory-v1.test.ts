import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOCATION_RULES } from "../allocation/allocation-rules";
import {
  BLOCKED_META_PHRASES,
  experimentArmATopicNouns,
  experimentArmBFirstPerson,
  isBlockedMetaPhrase,
  PHRASE_INVENTORY_V1,
  PHRASE_INVENTORY_VERSION,
  phrasesForClass,
} from "./phrase-inventory-v1";

describe("Phrase Inventory V1", () => {
  it("gives every phrase a stable key, family, class, locale, and version", () => {
    const keys = new Set<string>();
    for (const entry of PHRASE_INVENTORY_V1) {
      expect(entry.phrase_key.length).toBeGreaterThan(0);
      expect(keys.has(entry.phrase_key)).toBe(false);
      keys.add(entry.phrase_key);
      expect(entry.phrase.length).toBeGreaterThan(0);
      expect(entry.locale).toBe("zh-TW");
      expect(entry.inventory_version).toBe(PHRASE_INVENTORY_VERSION);
    }
  });

  it("records the four fat-loss terms as blocked_meta and keeps them off both experiment arms", () => {
    const blocked = phrasesForClass("blocked_meta").map((entry) => entry.phrase);
    expect(blocked.sort()).toEqual([...BLOCKED_META_PHRASES].sort());

    const sent = [
      ...experimentArmATopicNouns(),
      ...experimentArmBFirstPerson(),
    ].map((entry) => entry.phrase);

    for (const phrase of BLOCKED_META_PHRASES) {
      expect(isBlockedMetaPhrase(phrase)).toBe(true);
      expect(sent).not.toContain(phrase);
    }
  });

  it("gives arm A and arm B the same keyword_search budget", () => {
    expect(experimentArmATopicNouns()).toHaveLength(8);
    expect(experimentArmBFirstPerson()).toHaveLength(8);
    expect(
      experimentArmATopicNouns().every((entry) => entry.phrase_class === "topic_noun"),
    ).toBe(true);
    expect(
      experimentArmBFirstPerson().every((entry) => entry.phrase_class === "first_person_need"),
    ).toBe(true);
  });

  it("does not change the qualified-score threshold", () => {
    expect(DEFAULT_ALLOCATION_RULES.minimum_qualified_score).toBe(40);
  });
});
