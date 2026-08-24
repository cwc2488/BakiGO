import { describe, expect, it } from "vitest";
import { analyzeWithRepair } from "./provider";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";

describe("analyzeWithRepair live safety", () => {
  const corpus = normalizeCandidateContent({
    candidate_id: "cand_x",
    normalization_run_id: "norm_x",
    snapshots: [buildRawSnapshot({ external_content_id: "th_x", candidate_id: "cand_x" })],
  });

  it("does not fall back to FixtureAiRadarLlmProvider when fixture repair is disabled", async () => {
    await expect(
      analyzeWithRepair(
        {
          analyze: async () => {
            throw new SyntaxError("not json");
          },
        },
        { candidate_id: "cand_x", corpus },
        1,
        { allowFixtureRepair: false },
      ),
    ).rejects.toThrow(SyntaxError);
  });

  it("still repairs with fixture during unit tests", async () => {
    const result = await analyzeWithRepair(
      {
        analyze: async () => {
          throw new SyntaxError("not json");
        },
      },
      { candidate_id: "cand_x", corpus },
    );
    expect(result.repaired).toBe(true);
    expect(result.model_id).toBe("fixture_llm_v1");
  });
});
