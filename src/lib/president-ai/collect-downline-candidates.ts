import type { DownlinePartnerSuggestion } from "@/types/downline-partner";
import type { PriorityCandidate } from "./types";

export function collectDownlinePartnerCandidates(
  suggestions: DownlinePartnerSuggestion[],
): PriorityCandidate[] {
  return suggestions.map((suggestion) => ({
    sourceKey: suggestion.signalKey,
    title: suggestion.title,
    description: suggestion.description,
    category: "ACTIVE",
    current: 0,
    target: 1,
    remaining: 1,
    progressPercent: 0,
    enginePriority: suggestion.enginePriority,
    actionHref: suggestion.actionHref,
  }));
}
