import { describe, expect, it } from "vitest";
import { buildOrgKeywordPool } from "./build-org-keyword-pool";

describe("buildOrgKeywordPool", () => {
  it("deduplicates identical phrases across members", () => {
    const pool = buildOrgKeywordPool({
      "member-a": [{ keyword_id: "kw-a", phrase: "健身", discovery_weight: 10 }],
      "member-b": [{ keyword_id: "kw-b", phrase: "健身", discovery_weight: 8 }],
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].attributions).toHaveLength(2);
    expect(pool[0].normalized_phrase).toBe("健身");
  });

  it("preserves distinct phrases with attribution lists", () => {
    const pool = buildOrgKeywordPool({
      "member-a": [
        { keyword_id: "kw-a1", phrase: "健身", discovery_weight: 10 },
        { keyword_id: "kw-a2", phrase: "減重", discovery_weight: 5 },
      ],
      "member-b": [{ keyword_id: "kw-b1", phrase: "創業", discovery_weight: 8 }],
    });

    expect(pool).toHaveLength(3);
    const phrases = pool.map((entry) => entry.normalized_phrase).sort();
    expect(phrases).toEqual(["健身", "創業", "減重"].sort());
  });
});
