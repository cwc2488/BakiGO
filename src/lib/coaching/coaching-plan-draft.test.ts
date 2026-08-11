import { describe, expect, it } from "vitest";
import {
  cloneDefaultCoachingPlanSnapshot,
  DEFAULT_COACHING_PLAN_SNAPSHOT,
} from "@/lib/coaching/default-instructions";
import { planDraftToSnapshot, planSnapshotToDraft } from "@/lib/coaching/coaching-plan-draft";

describe("coaching plan draft", () => {
  it("roundtrips default snapshot through draft fields", () => {
    const draft = planSnapshotToDraft(cloneDefaultCoachingPlanSnapshot());
    const snapshot = planDraftToSnapshot(draft, DEFAULT_COACHING_PLAN_SNAPSHOT.reportingRules);

    expect(snapshot.dietaryGuidelines).toEqual(DEFAULT_COACHING_PLAN_SNAPSHOT.dietaryGuidelines);
    expect(snapshot.dailyInstructions.breakfast).toEqual(DEFAULT_COACHING_PLAN_SNAPSHOT.dailyInstructions.breakfast);
    expect(snapshot.reportingRules).toEqual(DEFAULT_COACHING_PLAN_SNAPSHOT.reportingRules);
  });

  it("preserves coach edits as line arrays", () => {
    const draft = planSnapshotToDraft(cloneDefaultCoachingPlanSnapshot());
    draft.breakfast = "自訂奶昔方式\n加一份蛋白";
    draft.coachNotes = "週五量測";

    const snapshot = planDraftToSnapshot(draft, DEFAULT_COACHING_PLAN_SNAPSHOT.reportingRules);
    expect(snapshot.dailyInstructions.breakfast).toEqual(["自訂奶昔方式", "加一份蛋白"]);
    expect(snapshot.coachNotes).toBe("週五量測");
  });
});
