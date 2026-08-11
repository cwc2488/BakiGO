import type {
  CoachingAiOutputRecord,
  CoachingDailyGenerationOutputJson,
  CoachingPriorAiContext,
} from "@/types/coaching-ai";
import { validateCoachingDailyGenerationOutputJson } from "@/lib/coaching/ai/coaching-daily-output-schema";

export function buildPriorAiContextFromOutput(
  output: Pick<CoachingAiOutputRecord, "id" | "logDate" | "outputJson" | "status">,
): CoachingPriorAiContext | null {
  if (output.status !== "completed" || !output.outputJson) {
    return null;
  }

  const parsed = validateCoachingDailyGenerationOutputJson(output.outputJson);
  if (!parsed) {
    return null;
  }

  const wrap = <T>(value: T | null | undefined) => {
    if (value == null || (typeof value === "string" && !value.trim())) {
      return null;
    }
    return {
      value: typeof value === "string" ? value.trim() : value,
      provenance: "ai_inference" as const,
      sourceOutputId: output.id,
      sourceLogDate: output.logDate,
    };
  };

  return {
    logDate: output.logDate,
    tomorrowFocus: wrap(parsed.customer.tomorrow_focus),
    recurringIssue: wrap(parsed.coach.recurring_issue),
    improvedIssue: wrap(parsed.coach.improved_issue),
  };
}

export function buildPriorAiContextFromPreviousOutput(
  previous: CoachingAiOutputRecord | null | undefined,
): CoachingPriorAiContext | null {
  if (!previous) {
    return null;
  }
  return buildPriorAiContextFromOutput(previous);
}

/** Guardrail: AI inference must never be written into activity tables. */
export function assertAiInferenceNotWrittenToActivityTables(): void {
  // Documentation hook — activity writes remain in coaching-service only.
}

export type PriorAiWritebackFields = Pick<
  CoachingDailyGenerationOutputJson["customer"],
  "tomorrow_focus"
> &
  Pick<CoachingDailyGenerationOutputJson["coach"], "recurring_issue" | "improved_issue">;

export function listPriorAiWritebackFields(output: CoachingDailyGenerationOutputJson): Array<keyof PriorAiWritebackFields | "coach.proposed_intervention_level"> {
  return ["tomorrow_focus", "recurring_issue", "improved_issue", "coach.proposed_intervention_level"];
}
