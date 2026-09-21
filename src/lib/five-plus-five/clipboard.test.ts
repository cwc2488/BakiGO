import { describe, expect, it } from "vitest";
import { copyTextToClipboard } from "@/lib/five-plus-five/clipboard";

describe("5＋5 clipboard fallback", () => {
  it("R — returns failure object instead of throwing when clipboard unavailable", async () => {
    // jsdom may or may not have clipboard; either way must not throw
    const result = await copyTextToClipboard("hello 5+5");
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
  });
});
