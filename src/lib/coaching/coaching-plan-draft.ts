import type { CoachingPlanSnapshot } from "@/types/coaching";

export function planLinesToText(lines: string[]): string {
  return lines.join("\n");
}

export function planTextToLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type CoachingPlanDraft = {
  dietaryGuidelines: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks: string;
  hydration: string;
  wakeUp: string;
  sleep: string;
  coachNotes: string;
};

export function planSnapshotToDraft(snapshot: CoachingPlanSnapshot): CoachingPlanDraft {
  return {
    dietaryGuidelines: planLinesToText(snapshot.dietaryGuidelines),
    breakfast: planLinesToText(snapshot.dailyInstructions.breakfast),
    lunch: planLinesToText(snapshot.dailyInstructions.lunch),
    dinner: planLinesToText(snapshot.dailyInstructions.dinner),
    snacks: planLinesToText(snapshot.dailyInstructions.snacks),
    hydration: planLinesToText(snapshot.dailyInstructions.hydration),
    wakeUp: planLinesToText(snapshot.dailyInstructions.wakeUp),
    sleep: planLinesToText(snapshot.dailyInstructions.sleep),
    coachNotes: snapshot.coachNotes ?? "",
  };
}

export function planDraftToSnapshot(
  draft: CoachingPlanDraft,
  reportingRules: string[],
): CoachingPlanSnapshot {
  return {
    version: 1,
    dietaryGuidelines: planTextToLines(draft.dietaryGuidelines),
    dailyInstructions: {
      wakeUp: planTextToLines(draft.wakeUp),
      breakfast: planTextToLines(draft.breakfast),
      lunch: planTextToLines(draft.lunch),
      dinner: planTextToLines(draft.dinner),
      snacks: planTextToLines(draft.snacks),
      hydration: planTextToLines(draft.hydration),
      sleep: planTextToLines(draft.sleep),
    },
    reportingRules,
    coachNotes: draft.coachNotes.trim(),
  };
}
