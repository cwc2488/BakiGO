import { describe, expect, it } from "vitest";
import { buildCoachingDailyCoachUserPrompt } from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { coachingLogDateOffset, coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";

describe("coaching 3-day backfill access", () => {
  it("accepts today/yesterday/day-before and rejects older dates", () => {
    const today = coachingTodayLogDate();
    const yesterday = coachingLogDateOffset(-1);
    const dayBefore = coachingLogDateOffset(-2);
    const tooOld = coachingLogDateOffset(-3);

    expect(requireAllowedCoachingLogDate(today)).toBe(today);
    expect(requireAllowedCoachingLogDate(yesterday)).toBe(yesterday);
    expect(requireAllowedCoachingLogDate(dayBefore)).toBe(dayBefore);
    expect(() => requireAllowedCoachingLogDate(tooOld)).toThrow(CoachingServiceError);
    expect(() => requireAllowedCoachingLogDate("2020-01-01")).toThrow(/最近 3 天/);
  });

  it("prompt marks non-today report days for historical wording", () => {
    const packed = buildScenarioDecisionContext("D_hunger_shake_fried_rice");
    const yesterday = coachingLogDateOffset(-1);
    packed.generationInput.logDate = yesterday;
    packed.generationInput.todayContext.logDate = yesterday;

    const userPrompt = buildCoachingDailyCoachUserPrompt({
      generationInput: packed.generationInput,
      finalInterventionLevel: packed.finalInterventionLevel,
      preparedMealImages: [],
      decisionContext: packed.decisionContext,
    });

    expect(userPrompt).toContain(`"reportDayRelation": "yesterday"`);
    expect(userPrompt).toContain("禁止用「今天你…」描述這份回報");
    expect(userPrompt).toContain(yesterday);
  });
});
