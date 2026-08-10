import { describe, expect, it } from "vitest";
import { CHARACTER_ASSETS, getCharacterAsset } from "./character-assets";
import { PERSONALITY_TYPES } from "./types";

describe("character-assets", () => {
  it("maps all six personalities to official character assets", () => {
    for (const type of PERSONALITY_TYPES) {
      const asset = getCharacterAsset(type);
      expect(asset.type).toBe(type);
      expect(asset.src).toMatch(/^\/quiz\/fat-loss\/characters\/[a-f]-.+\.png$/);
      expect(asset.heroAlt.length).toBeGreaterThan(0);
      expect(asset.sceneGradient).toHaveLength(3);
    }
  });

  it("uses unique asset paths per personality", () => {
    const paths = PERSONALITY_TYPES.map((type) => CHARACTER_ASSETS[type].src);
    expect(new Set(paths).size).toBe(PERSONALITY_TYPES.length);
  });
});
