import { describe, expect, it } from "vitest";
import {
  extractAiProposedInterventionLevel,
  validateCoachingDailyGenerationOutputJson,
} from "@/lib/coaching/ai/coaching-daily-output-schema";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

const validOutput: CoachingDailyGenerationOutputJson = {
  version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  customer: {
    encouragement: "做得好",
    today_feedback: "飲水充足",
    adjustment_priorities: ["早餐"],
    tomorrow_focus: "維持飲水",
  },
  coach: {
    daily_summary: "整體穩定",
    recurring_issue: null,
    improved_issue: "睡眠改善",
    proposed_intervention_level: "normal" as const,
    coach_attention_required: false,
    attention_reason: null,
    evidence: ["water 1500ml"],
  },
};

describe("validateCoachingDailyGenerationOutputJson", () => {
  it("accepts valid output", () => {
    expect(validateCoachingDailyGenerationOutputJson(validOutput)).toEqual(validOutput);
  });

  it("rejects more than two adjustment priorities", () => {
    expect(
      validateCoachingDailyGenerationOutputJson({
        ...validOutput,
        customer: {
          ...validOutput.customer,
          adjustment_priorities: ["a", "b", "c"],
        },
      }),
    ).toBeNull();
  });

  it("rejects invalid intervention level", () => {
    expect(
      validateCoachingDailyGenerationOutputJson({
        ...validOutput,
        coach: {
          ...validOutput.coach,
          proposed_intervention_level: "observe",
        },
      }),
    ).toBeNull();
  });
});

describe("extractAiProposedInterventionLevel", () => {
  it("returns coach proposal for audit only", () => {
    expect(extractAiProposedInterventionLevel(validOutput)).toBe("normal");
    expect(extractAiProposedInterventionLevel(null)).toBeNull();
  });
});
