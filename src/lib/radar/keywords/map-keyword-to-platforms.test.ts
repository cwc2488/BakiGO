import { describe, expect, it } from "vitest";
import { discoverPlatformsForKeyword, mapKeywordToPlatforms } from "./map-keyword-to-platforms";

describe("mapKeywordToPlatforms", () => {
  it("routes automated discover to Threads only", () => {
    const mapping = mapKeywordToPlatforms("健身");
    expect(mapping.threads.eligible).toBe(true);
    expect(mapping.instagram.action).toBe("skip");
  });

  it("discoverPlatformsForKeyword excludes Instagram", () => {
    expect(discoverPlatformsForKeyword("創業")).toEqual(["threads"]);
  });
});
