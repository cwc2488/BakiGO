import { describe, expect, it } from "vitest";
import {
  COACHING_GENERATION_MAX_ATTEMPTS,
  COACHING_GENERATION_RETRY_DELAYS_MS,
} from "@/types/coaching-ai";
import {
  planDailyCoachGenerationSubmit,
  preservesCompletedOutputWhenDenied,
  resolveGenerationOutputMutation,
} from "@/lib/coaching/ai/coaching-generation-submit";

describe("phase 2c generation queue contracts", () => {
  it("uses 5s then 20s retry delays and caps attempts at 3", () => {
    expect(COACHING_GENERATION_RETRY_DELAYS_MS).toEqual([5_000, 20_000]);
    expect(COACHING_GENERATION_MAX_ATTEMPTS).toBe(3);
  });

  it("does not clear completed output when regeneration cap denies enqueue", () => {
    const existing = {
      inputFingerprint: "old",
      status: "completed" as const,
      regenerationCount: 2,
    };
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "new",
      existingOutput: existing,
      activeJobs: [],
    });
    expect(decision).toEqual({ action: "skip", reason: "max_regenerations_reached" });
    const mutation = resolveGenerationOutputMutation(decision, "new");
    expect(mutation).toBeNull();
    expect(preservesCompletedOutputWhenDenied(existing, decision, mutation)).toBe(true);
  });

  it("skips same fingerprint completed without enqueue", () => {
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "same",
      existingOutput: {
        inputFingerprint: "same",
        status: "completed",
        regenerationCount: 0,
      },
      activeJobs: [],
    });
    expect(decision.action).toBe("skip");
    expect(decision).toMatchObject({ reason: "same_fingerprint_completed" });
  });
});
