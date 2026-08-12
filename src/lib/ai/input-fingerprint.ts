import { createHash } from "node:crypto";
import type { CoachingAiInputSnapshot, CoachingGenerationInput, CoachingPriorAiContext } from "@/types/coaching-ai";

export function canonicalizeForFingerprint(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function fingerprintCoachingInputSnapshot(snapshot: CoachingAiInputSnapshot): string {
  return createHash("sha256").update(canonicalizeForFingerprint(snapshot)).digest("hex");
}

function priorAiContextForFingerprint(context: CoachingPriorAiContext | null): unknown {
  if (!context) {
    return null;
  }

  return {
    logDate: context.logDate,
    tomorrowFocus: context.tomorrowFocus?.value ?? null,
    recurringIssue: context.recurringIssue?.value ?? null,
    improvedIssue: context.improvedIssue?.value ?? null,
    pendingFollowUps: (context.pendingFollowUps ?? []).map((item) => ({
      subject: item.subject,
      question: item.question,
      status: item.status,
    })),
  };
}

/** Semantic payload only — excludes builtAt and provenance metadata ids. */
export function buildGenerationInputFingerprintPayload(input: CoachingGenerationInput): unknown {
  return {
    version: input.version,
    logDate: input.logDate,
    profileMemory: input.profileMemory,
    rollingMemory: input.rollingMemory,
    outcomeMemory: input.outcomeMemory,
    coachDirectives: input.coachDirectives,
    todayContext: input.todayContext,
    priorAiContext: priorAiContextForFingerprint(input.priorAiContext),
    interventionContext: input.interventionContext,
  };
}

export function fingerprintCoachingGenerationInput(input: CoachingGenerationInput): string {
  return createHash("sha256")
    .update(canonicalizeForFingerprint(buildGenerationInputFingerprintPayload(input)))
    .digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep(record[key]);
        return acc;
      }, {});
  }
  return value;
}
