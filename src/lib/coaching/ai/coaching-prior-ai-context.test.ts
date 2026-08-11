import { describe, expect, it } from "vitest";
import { buildPriorAiContextFromOutput } from "@/lib/coaching/ai/coaching-prior-ai-context";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION } from "@/types/coaching-ai";

describe("buildPriorAiContextFromOutput", () => {
  it("extracts provenance-tagged prior AI fields from completed output", () => {
    const context = buildPriorAiContextFromOutput({
      id: "out-1",
      logDate: "2026-08-10",
      status: "completed",
      outputJson: {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          encouragement: "a",
          today_feedback: "b",
          adjustment_priorities: [],
          tomorrow_focus: "  明天多喝水  ",
        },
        coach: {
          daily_summary: "s",
          recurring_issue: "late sleep",
          improved_issue: null,
          proposed_intervention_level: "watch",
          coach_attention_required: false,
          attention_reason: null,
          evidence: [],
        },
      },
    });

    expect(context).toEqual({
      logDate: "2026-08-10",
      tomorrowFocus: {
        value: "明天多喝水",
        provenance: "ai_inference",
        sourceOutputId: "out-1",
        sourceLogDate: "2026-08-10",
      },
      recurringIssue: {
        value: "late sleep",
        provenance: "ai_inference",
        sourceOutputId: "out-1",
        sourceLogDate: "2026-08-10",
      },
      improvedIssue: null,
    });
  });

  it("returns null for non-completed or invalid output", () => {
    expect(
      buildPriorAiContextFromOutput({
        id: "out-1",
        logDate: "2026-08-10",
        status: "pending",
        outputJson: null,
      }),
    ).toBeNull();
  });
});
