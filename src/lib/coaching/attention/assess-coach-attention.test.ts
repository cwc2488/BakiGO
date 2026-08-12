import { describe, expect, it } from "vitest";
import {
  assessCoachAttention,
  assessCoachingNonReporting,
  assessMeasurementReminder,
} from "@/lib/coaching/attention/assess-coach-attention";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { buildCoachingDecisionContext, getFixtureMealObservations } from "@/lib/coaching/ai/coaching-signal-engine";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { COACHING_MEASUREMENT_FOLLOWUP_POLICY, COACHING_NON_REPORTING_POLICY } from "@/lib/coaching/attention/coach-attention-policy";
import type { CoachingRollingMemory } from "@/types/coaching-ai";
import type { CoachingRecentCoachAction, CoachingSubmissionDay } from "@/types/coaching-attention";
import type { CoachingSignal } from "@/types/coaching-signals";

function emptyRolling(overrides?: Partial<CoachingRollingMemory>): CoachingRollingMemory {
  return {
    windowDays: 14,
    aggregates: {
      windowDays: 14,
      daysWithReport: 12,
      daysSubmitted: 12,
      mealReportRate: 1,
      breakfastCompletionRate: 1,
      lunchCompletionRate: 1,
      dinnerCompletionRate: 1,
      averageWaterMl: 4500,
      averageSleepDurationMinutes: 450,
      lateSleepDays: 0,
      exerciseDays: 8,
      bowelMovementSummary: { daysReported: 10, totalCount: 10, averagePerDay: 1 },
    },
    recentDays: [],
    recurringPatterns: [],
    ...overrides,
  };
}

function denseSubmittedCalendar(asOf: string, days: number, missDates: string[] = []): CoachingSubmissionDay[] {
  const miss = new Set(missDates);
  const out: CoachingSubmissionDay[] = [];
  const [y, m, d] = asOf.split("-").map(Number);
  for (let i = 0; i < days; i += 1) {
    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() - i);
    const iso = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
    out.push({ logDate: iso, submitted: !miss.has(iso) });
  }
  return out;
}

describe("Phase 3a Coach Attention Engine", () => {
  describe("CC-A — Healthy Routine", () => {
    it("normal reporting + baseline_only → routine (not attention)", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("A_normal");
      // A_normal has no body — insufficient_data. Use I baseline for healthy early journey.
      const baseline = buildScenarioDecisionContext("I_baseline_only_fat_loss");
      const assessment = assessCoachAttention({
        asOfLogDate: baseline.generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: baseline.generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: baseline.decisionContext.finalInterventionLevel,
        coachAttention: baseline.decisionContext.coachAttention,
        signals: baseline.decisionContext.signals,
        outcomeAssessment: baseline.decisionContext.outcomeAssessment,
        rollingMemory: baseline.generationInput.rollingMemory,
        submissionCalendar: denseSubmittedCalendar(baseline.generationInput.logDate, 14),
        todayCustomerNote: baseline.generationInput.todayContext.customerNote,
      });
      expect(assessment.tier).toBe("routine");
      expect(assessment.reasonCodes).not.toContain("final_intervention_coach_attention");
      expect(decisionContext.finalInterventionLevel).toBe("normal");
      void generationInput;
    });
  });

  describe("CC-B — Single Bad Meal", () => {
    it("single fried meal does not raise coach_attention", () => {
      const fixture = buildCoachingAiFixtureGenerationInput("F_single_meal_fried");
      const decisionContext = buildCoachingDecisionContext({
        generationInput: fixture.generationInput,
        mealObservations: getFixtureMealObservations("F_single_meal_fried"),
        customerVoice: extractCustomerVoiceSignals(fixture.generationInput.todayContext.customerNote),
      });
      const assessment = assessCoachAttention({
        asOfLogDate: fixture.generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: fixture.generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: fixture.generationInput.rollingMemory,
        submissionCalendar: denseSubmittedCalendar(fixture.generationInput.logDate, 14),
      });
      expect(decisionContext.finalInterventionLevel).toBe("normal");
      expect(assessment.tier).not.toBe("coach_attention");
      expect(assessment.tier === "routine" || assessment.tier === "positive_progress").toBe(true);
    });
  });

  describe("CC-C — Recurring Late Sleep", () => {
    it("14-day late sleep pattern → watch with expandable evidence", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: {
          ...generationInput.rollingMemory,
          aggregates: {
            ...generationInput.rollingMemory.aggregates,
            lateSleepDays: Math.max(generationInput.rollingMemory.aggregates.lateSleepDays, 4),
          },
        },
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.reasonCodes).toContain("recurring_late_sleep");
      const lateEvidence = assessment.evidence.find((item) => item.type === "late_sleep");
      expect(lateEvidence).toBeTruthy();
      expect(lateEvidence!.items.length).toBeGreaterThan(0);
    });
  });

  describe("CC-D — Sustained Non-reporting", () => {
    it("today before grace stays today_not_yet, not sustained", () => {
      const rolling = emptyRolling({
        aggregates: {
          ...emptyRolling().aggregates,
          daysSubmitted: 10,
          daysWithReport: 10,
        },
      });
      const asOf = "2026-08-12";
      const nonReporting = assessCoachingNonReporting({
        asOfLogDate: asOf,
        asOfHourTaipei: 15,
        submissionCalendar: denseSubmittedCalendar(asOf, 14, [asOf]),
        rollingMemory: rolling,
      });
      expect(nonReporting.status).toBe("today_not_yet");
      expect(nonReporting.reasonCode).toBe("today_not_yet_reported");
    });

    it("4+ consecutive misses after grace → sustained watch", () => {
      const asOf = "2026-08-12";
      const miss = ["2026-08-12", "2026-08-11", "2026-08-10", "2026-08-09", "2026-08-08"];
      const rolling = emptyRolling({
        aggregates: {
          ...emptyRolling().aggregates,
          daysSubmitted: 3,
          daysWithReport: 3,
        },
        recurringPatterns: ["submission_inconsistent"],
      });
      const { decisionContext, generationInput } = buildScenarioDecisionContext("A_normal");
      const assessment = assessCoachAttention({
        asOfLogDate: asOf,
        asOfHourTaipei: COACHING_NON_REPORTING_POLICY.todayGraceHourTaipei,
        daysSinceEnrollmentStart: 20,
        finalInterventionLevel: "normal",
        coachAttention: { required: false, reason: null, evidence: [] },
        signals: decisionContext.signals,
        outcomeAssessment: {
          ...decisionContext.outcomeAssessment,
          outcomeStatus: "not_yet_measurable",
          goalContext: {
            ...decisionContext.outcomeAssessment.goalContext,
            measurementStage: "baseline_only",
            baselineDate: "2026-07-20",
            daysSinceLatestMeasurement: 5,
          },
        },
        rollingMemory: rolling,
        submissionCalendar: denseSubmittedCalendar(asOf, 14, miss),
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.reasonCodes).toContain("sustained_non_reporting");
      void generationInput;
    });
  });

  describe("CC-E — Improving", () => {
    it("improving + stable execution → positive_progress", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("J_second_measurement_improving");
      const rolling = emptyRolling({
        aggregates: {
          ...emptyRolling().aggregates,
          daysWithReport: 12,
          daysSubmitted: 12,
          lateSleepDays: 0,
        },
      });
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: "normal",
        coachAttention: { required: false, reason: null, evidence: [] },
        signals: decisionContext.signals.filter((s) => s.severity === "positive" || s.category === "body_trend"),
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: rolling,
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");
      expect(assessment.tier).toBe("positive_progress");
      expect(assessment.reasonCodes).toContain("positive_body_outcome");
    });
  });

  describe("CC-F — Improving + Serious Attention", () => {
    it("body improving cannot override coach_attention", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("J_second_measurement_improving");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: "coach_attention",
        coachAttention: {
          required: true,
          reason: "rolling:late_sleep_pattern",
          evidence: [{ key: "late_sleep_days", value: 5 }],
        },
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: emptyRolling({
          aggregates: { ...emptyRolling().aggregates, lateSleepDays: 5, daysSubmitted: 12, daysWithReport: 12 },
        }),
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");
      expect(assessment.tier).toBe("coach_attention");
      expect(assessment.commandCenterSection).toBe("needs_attention");
    });
  });

  describe("CC-G — Baseline Only early", () => {
    it("baseline_only early journey stays routine; not flat", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("I_baseline_only_fat_loss");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: generationInput.rollingMemory,
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(decisionContext.outcomeAssessment.outcomeStatus).toBe("not_yet_measurable");
      expect(assessment.tier).toBe("routine");
      expect(assessment.measurementReminder).toBe(false);
      expect(assessment.reasonCodes).not.toContain("outcome_flat_two_period");
    });
  });

  describe("CC-H — Measurement Due", () => {
    it("baseline_only past provisional window → measurement reminder, not body failure", () => {
      const reminder = assessMeasurementReminder({
        measurementStage: "baseline_only",
        baselineMissing: false,
        daysSinceLatestMeasurement: COACHING_MEASUREMENT_FOLLOWUP_POLICY.followUpDaysAfterLatestMeasurement,
        daysSinceEnrollmentStart: 20,
      });
      expect(reminder.measurementReminder).toBe(true);

      const { decisionContext, generationInput } = buildScenarioDecisionContext("M_baseline_only_day10");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: 20,
        finalInterventionLevel: "normal",
        coachAttention: { required: false, reason: null, evidence: [] },
        signals: [],
        outcomeAssessment: {
          ...decisionContext.outcomeAssessment,
          outcomeStatus: "not_yet_measurable",
          goalContext: {
            ...decisionContext.outcomeAssessment.goalContext,
            measurementStage: "baseline_only",
            baselineDate: "2026-07-01",
            daysSinceLatestMeasurement: 14,
            daysSinceEnrollmentStart: 20,
          },
        },
        rollingMemory: emptyRolling(),
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(assessment.measurementReminder).toBe(true);
      expect(assessment.reasonCodes).toContain("measurement_due");
      expect(assessment.tier).toBe("routine");
      expect(assessment.commandCenterSection).toBe("measurement_due");
      expect(assessment.primaryReason).toMatch(/回測|量測/);
      expect(assessment.primaryReason).not.toMatch(/沒有進步|失敗/);
    });
  });

  describe("CC-I — Two-period Flat", () => {
    it("reuses Phase 2f N authority → watch, does not invent coach_attention", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("N_two_periods_flat");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: generationInput.rollingMemory,
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(decisionContext.finalInterventionLevel).toBe("watch");
      expect(assessment.tier).toBe("watch");
      expect(assessment.tier).not.toBe("coach_attention");
      expect(
        assessment.reasonCodes.some((code) =>
          ["outcome_flat_two_period", "final_intervention_watch", "recurring_late_sleep"].includes(code),
        ),
      ).toBe(true);
    });
  });

  describe("CC-J — Customer Repeated Hunger", () => {
    it("repeated hunger notes → watch with evidence dates", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("A_normal");
      const notes = [
        { logDate: "2026-08-11", customerNote: "還是會餓" },
        { logDate: "2026-08-08", customerNote: "很容易餓" },
        { logDate: "2026-08-05", customerNote: "肚子餓" },
      ];
      const assessment = assessCoachAttention({
        asOfLogDate: "2026-08-11",
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: 40,
        finalInterventionLevel: "normal",
        coachAttention: { required: false, reason: null, evidence: [] },
        signals: decisionContext.signals,
        outcomeAssessment: {
          ...decisionContext.outcomeAssessment,
          outcomeStatus: "not_yet_measurable",
          goalContext: {
            ...decisionContext.outcomeAssessment.goalContext,
            measurementStage: "baseline_only",
            baselineDate: "2026-07-01",
            daysSinceLatestMeasurement: 3,
          },
        },
        rollingMemory: emptyRolling(),
        submissionCalendar: denseSubmittedCalendar("2026-08-11", 14),
        todayCustomerNote: "還是會餓",
        historicalCustomerNotes: notes,
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.reasonCodes).toContain("customer_voice_recurring_hunger");
      const voice = assessment.evidence.find((item) => item.type === "customer_voice");
      expect(String(voice?.items.find((i) => i.key === "hunger_dates")?.value)).toContain("2026-08");
      void generationInput;
    });
  });

  describe("CC-K — Coach Already Handled", () => {
    it("recent matching action suppresses duplicate recommendation but keeps watch tier", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
      const action: CoachingRecentCoachAction = {
        id: "action-1",
        actionType: "note",
        relatedReasonCodes: ["recurring_late_sleep"],
        note: "已詢問晚睡，Customer 表示最近加班。",
        createdAt: "2026-08-11T10:00:00.000+08:00",
        resolvedAt: "2026-08-11T10:05:00.000+08:00",
      };
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        asOfIso: "2026-08-11T18:00:00.000+08:00",
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: {
          ...generationInput.rollingMemory,
          aggregates: {
            ...generationInput.rollingMemory.aggregates,
            lateSleepDays: Math.max(4, generationInput.rollingMemory.aggregates.lateSleepDays),
          },
        },
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
        recentCoachActions: [action],
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.recentCoachActionAcknowledged).toBe(true);
      expect(assessment.suppressedReasonCodes).toContain("recurring_late_sleep");
      expect(assessment.recommendedActionType).toBe("continue_observe_known_context");
    });
  });

  describe("CC-L — Condition Persists After Handling", () => {
    it("ack outside suppress window allows re-remind", () => {
      const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
      const staleAction: CoachingRecentCoachAction = {
        id: "action-old",
        actionType: "note",
        relatedReasonCodes: ["recurring_late_sleep"],
        note: "已詢問晚睡，Customer 表示最近加班。",
        createdAt: "2026-08-08T10:00:00.000+08:00",
        resolvedAt: "2026-08-08T10:05:00.000+08:00",
      };
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        asOfIso: "2026-08-11T18:00:00.000+08:00",
        daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
        finalInterventionLevel: decisionContext.finalInterventionLevel,
        coachAttention: decisionContext.coachAttention,
        signals: decisionContext.signals,
        outcomeAssessment: decisionContext.outcomeAssessment,
        rollingMemory: {
          ...generationInput.rollingMemory,
          aggregates: {
            ...generationInput.rollingMemory.aggregates,
            lateSleepDays: Math.max(4, generationInput.rollingMemory.aggregates.lateSleepDays),
          },
        },
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
        recentCoachActions: [staleAction],
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.recentCoachActionAcknowledged).toBe(false);
      expect(assessment.recommendedActionType).toBe("ask_late_sleep_reason");
    });
  });

  describe("single-day noise regression", () => {
    it("synthetic today-only meal signal does not force attention", () => {
      const singleMeal: CoachingSignal = {
        key: "meal_fried_food",
        category: "meal",
        severity: "minor",
        source: "today",
        confidence: "vision_assisted",
        evidence: [
          { key: "observation_signal", value: "fried_food" },
          { key: "meal_slot", value: "lunch" },
        ],
      };
      const { decisionContext, generationInput } = buildScenarioDecisionContext("A_normal");
      const assessment = assessCoachAttention({
        asOfLogDate: generationInput.logDate,
        asOfHourTaipei: 15,
        daysSinceEnrollmentStart: 10,
        finalInterventionLevel: "normal",
        coachAttention: { required: false, reason: null, evidence: [] },
        signals: [...decisionContext.signals, singleMeal],
        outcomeAssessment: {
          ...decisionContext.outcomeAssessment,
          outcomeStatus: "not_yet_measurable",
          goalContext: {
            ...decisionContext.outcomeAssessment.goalContext,
            measurementStage: "baseline_only",
            baselineDate: "2026-08-01",
            daysSinceLatestMeasurement: 2,
          },
        },
        rollingMemory: emptyRolling(),
        submissionCalendar: denseSubmittedCalendar(generationInput.logDate, 14),
      });
      expect(assessment.tier).toBe("routine");
    });
  });
});
