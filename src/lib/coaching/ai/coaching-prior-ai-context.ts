import type {
  CoachingAiOutputRecord,
  CoachingDailyGenerationOutputJson,
  CoachingPriorAiContext,
} from "@/types/coaching-ai";
import { validateCoachingDailyGenerationOutputJson } from "@/lib/coaching/ai/coaching-daily-output-schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Prefer full schema validation; fall back to light field extract for legacy rows.
 */
function extractPriorFields(outputJson: CoachingDailyGenerationOutputJson | Record<string, unknown>): {
  tomorrowFocus: string | null;
  recurringIssue: string | null;
  improvedIssue: string | null;
  pendingFollowUps: CoachingPriorAiContext["pendingFollowUps"];
} | null {
  const validated = validateCoachingDailyGenerationOutputJson(outputJson);
  if (validated) {
    return {
      tomorrowFocus: validated.customer.tomorrow_focus,
      recurringIssue: validated.coach.recurring_issue,
      improvedIssue: validated.coach.improved_issue,
      pendingFollowUps: (validated.coach.follow_ups ?? [])
        .filter((item) => item.status === "pending")
        .map((item) => ({
          subject: item.subject,
          question: item.question,
          sourceLogDate: "",
          status: item.status,
        })),
    };
  }

  const root = asRecord(outputJson);
  const customer = asRecord(root?.customer);
  const coach = asRecord(root?.coach);
  if (!customer || !coach) {
    return null;
  }

  const followUpsRaw = Array.isArray(coach.follow_ups) ? coach.follow_ups : [];
  const pendingFollowUps = followUpsRaw
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.status === "pending")
    .map((item) => ({
      subject: readString(item.subject) ?? "follow_up",
      question: readString(item.question) ?? "",
      sourceLogDate: "",
      status: "pending" as const,
    }))
    .filter((item) => item.question.length > 0);

  return {
    tomorrowFocus: readString(customer.tomorrow_focus),
    recurringIssue: readString(coach.recurring_issue),
    improvedIssue: readString(coach.improved_issue),
    pendingFollowUps,
  };
}

export function buildPriorAiContextFromOutput(
  output: Pick<CoachingAiOutputRecord, "id" | "logDate" | "status"> & {
    outputJson: CoachingAiOutputRecord["outputJson"] | Record<string, unknown> | null;
  },
): CoachingPriorAiContext | null {
  if (output.status !== "completed" || !output.outputJson) {
    return null;
  }

  const fields = extractPriorFields(output.outputJson as CoachingDailyGenerationOutputJson);
  if (!fields) {
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
    tomorrowFocus: wrap(fields.tomorrowFocus),
    recurringIssue: wrap(fields.recurringIssue),
    improvedIssue: wrap(fields.improvedIssue),
    pendingFollowUps: fields.pendingFollowUps.map((item) => ({
      ...item,
      sourceLogDate: output.logDate,
    })),
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

export function listPriorAiWritebackFields(
  output: CoachingDailyGenerationOutputJson,
): Array<keyof PriorAiWritebackFields | "coach.proposed_intervention_level"> {
  void output;
  return ["tomorrow_focus", "recurring_issue", "improved_issue", "coach.proposed_intervention_level"];
}
