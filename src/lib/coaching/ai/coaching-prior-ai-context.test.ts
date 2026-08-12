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
          daily_food_summary: "c",
          meal_feedback: { breakfast: null, lunch: null, dinner: null },
          lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
          customer_voice_response: null,
          adjustment_priorities: [],
          tomorrow_focus: "  明天多喝水  ",
          follow_up_for_tomorrow: null,
        },
        coach: {
          daily_summary: "s",
          recurring_issue: "late sleep",
          improved_issue: null,
          proposed_intervention_level: "watch",
          coach_attention_required: false,
          attention_reason: null,
          evidence: [],
          follow_ups: [{ subject: "hunger", question: "還會餓嗎？", status: "pending" }],
          photo_reuse_flags: [],
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
      pendingFollowUps: [
        {
          subject: "hunger",
          question: "還會餓嗎？",
          sourceLogDate: "2026-08-10",
          status: "pending",
        },
      ],
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
