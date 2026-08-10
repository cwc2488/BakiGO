import { describe, expect, it } from "vitest";
import { CHARACTER_ASSETS, getCharacterAsset } from "./character-assets";
import { PERSONALITY_TYPES } from "./types";

describe("character-assets", () => {
  it("maps all six personalities to hero and thumb assets", () => {
    for (const type of PERSONALITY_TYPES) {
      const asset = getCharacterAsset(type);
      expect(asset.type).toBe(type);
      expect(asset.heroSrc).toMatch(/^\/quiz\/fat-loss\/characters\/[a-f]-.+\.svg$/);
      expect(asset.thumbSrc).toMatch(/^\/quiz\/fat-loss\/characters\/[a-f]-.+thumb\.svg$/);
      expect(asset.heroAlt.length).toBeGreaterThan(0);
      expect(asset.sceneGradient).toHaveLength(3);
    }
  });

  it("uses unique asset paths per personality", () => {
    const heroPaths = PERSONALITY_TYPES.map((type) => CHARACTER_ASSETS[type].heroSrc);
    expect(new Set(heroPaths).size).toBe(PERSONALITY_TYPES.length);
  });
});
