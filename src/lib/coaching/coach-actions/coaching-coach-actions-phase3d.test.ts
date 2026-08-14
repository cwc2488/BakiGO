import { describe, expect, it } from "vitest";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { assessCoachingOutcome } from "@/lib/coaching/ai/assess-coaching-outcome";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import { buildRecentCoachActionMemory } from "@/lib/coaching/coach-actions/build-recent-coach-action-memory";
import { assessCoachAttention } from "@/lib/coaching/attention/assess-coach-attention";
import { buildDenseSubmissionCalendar } from "@/lib/coaching/attention/build-dense-submission-calendar";
import { buildCoachActionTimelineEvents } from "@/lib/coaching/timeline/build-coach-action-timeline-events";
import { buildCoachingTimelineEvents, filterTimelineEvents } from "@/lib/coaching/timeline/build-timeline-events";
import { buildCoachingDailyCoachSystemPrompt } from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import {
  inferCoachActionMaterial,
  type CoachingCoachActionRecord,
} from "@/types/coaching-coach-actions";
import type { CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import type { CoachingRecentCoachAction } from "@/types/coaching-attention";

function denseSubmittedCalendar(asOfLogDate: string, days: number) {
  return buildDenseSubmissionCalendar({
    asOfLogDate,
    windowDays: days,
    logs: Array.from({ length: days }, (_, index) => {
      const date = shiftDate(asOfLogDate, -(days - 1 - index));
      return { logDate: date, submitted: true };
    }),
  });
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function actionRecord(overrides?: Partial<CoachingCoachActionRecord>): CoachingCoachActionRecord {
  const note = overrides?.note ?? "Customer 最近因工作加班晚睡。";
  const actionType = overrides?.actionType ?? "acknowledged";
  return {
    id: overrides?.id ?? "ca-1",
    enrollmentId: overrides?.enrollmentId ?? "enroll-1",
    customerId: overrides?.customerId ?? "cust-1",
    ownerMemberId: overrides?.ownerMemberId ?? "owner-1",
    actionType,
    status: overrides?.status ?? "acknowledged",
    note,
    relatedReasonCodes: overrides?.relatedReasonCodes ?? ["recurring_late_sleep"],
    evidenceRefs: overrides?.evidenceRefs ?? [],
    relatedLogDate: overrides?.relatedLogDate ?? "2026-08-11",
    relatedMeasurementId: overrides?.relatedMeasurementId ?? null,
    isMaterial: overrides?.isMaterial ?? inferCoachActionMaterial({ actionType, note }),
    supersededBy: overrides?.supersededBy ?? null,
    createdAt: overrides?.createdAt ?? "2026-08-11T10:00:00.000+08:00",
    resolvedAt: overrides?.resolvedAt ?? null,
    updatedAt: overrides?.updatedAt ?? "2026-08-11T10:00:00.000+08:00",
  };
}

function toAttentionAction(record: CoachingCoachActionRecord): CoachingRecentCoachAction {
  return {
    id: record.id,
    actionType: record.actionType,
    relatedReasonCodes: record.relatedReasonCodes as CoachingRecentCoachAction["relatedReasonCodes"],
    note: record.note,
    createdAt: record.createdAt,
    resolvedAt: record.resolvedAt,
  };
}

function lateSleepAssessment(input?: {
  recentCoachActions?: CoachingRecentCoachAction[];
  asOfIso?: string;
  finalInterventionLevel?: "normal" | "watch" | "coach_attention";
}) {
  const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
  return assessCoachAttention({
    asOfLogDate: generationInput.logDate,
    asOfHourTaipei: 15,
    asOfIso: input?.asOfIso ?? "2026-08-11T18:00:00.000+08:00",
    daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    finalInterventionLevel: input?.finalInterventionLevel ?? decisionContext.finalInterventionLevel,
    coachAttention:
      input?.finalInterventionLevel === "coach_attention"
        ? { required: true, reason: "escalated", evidence: [{ key: "tier", value: "coach_attention" }] }
        : decisionContext.coachAttention,
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
    recentCoachActions: input?.recentCoachActions,
  });
}

function sampleOutput(overrides?: {
  coachSummary?: string;
  attentionReason?: string | null;
  evidence?: string[];
}): CoachingDailyGenerationOutputJson {
  return {
    version: 1,
    customer: {
      encouragement: "你有認真回報，這點很好。",
      today_feedback: "今天整體有回報。",
      daily_food_summary: "今天飲食大致可觀察。",
      customer_voice_response: null,
      adjustment_priorities: [],
      tomorrow_focus: "明天先維持穩定回報。",
      follow_up_for_tomorrow: null,
      lifestyle_feedback: { sleep: "睡眠時數尚可，入睡偏晚。", hydration: null, exercise: null },
      meal_feedback: {
        breakfast: { summary: "早餐有回報", good_point: null, adjustment: null, follow_up_question: null },
        lunch: { summary: "午餐有回報", good_point: null, adjustment: null, follow_up_question: null },
        dinner: { summary: "晚餐有回報", good_point: null, adjustment: null, follow_up_question: null },
      },
    },
    coach: {
      daily_summary: overrides?.coachSummary ?? "晚睡 pattern 持續，但已有加班 context。",
      recurring_issue: "晚睡",
      improved_issue: null,
      proposed_intervention_level: "watch",
      coach_attention_required: false,
      attention_reason: overrides?.attentionReason ?? null,
      evidence: overrides?.evidence ?? ["late_sleep"],
      follow_ups: [],
      photo_reuse_flags: [],
      daily_nutrition_assessment: null,
    },
  };
}

function allQualityChecks(report: { customer: Array<{ id: string; status: string }>; coach: Array<{ id: string; status: string }> }) {
  return [...report.customer, ...report.coach];
}

describe("Phase 3d Coach Action Persistence & Memory", () => {
  it("prompt version bumps for coach action memory", () => {
    expect(COACHING_DAILY_AI_PROMPT_VERSION).toBe("coaching_daily_v3d3");
    expect(buildCoachingDailyCoachSystemPrompt()).toContain("Known Context");
  });

  describe("CA-A — Add Note → timeline event", () => {
    it("emits coach_action timeline event from persisted-shaped record", () => {
      const record = actionRecord({
        actionType: "note",
        status: "open",
        note: "Customer 最近加班。",
      });
      const events = buildCoachActionTimelineEvents({
        enrollmentId: record.enrollmentId,
        enrollmentStartedAt: "2026-07-01T00:00:00.000Z",
        actions: [record],
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("coach_action");
      expect(events[0]!.title).toContain("晚睡");
      expect(events[0]!.summary).toContain("加班");
      if (events[0]!.type === "coach_action") {
        expect(events[0]!.payload.statusLabel).toBe("持續觀察");
      }
    });
  });

  describe("CA-B — Acknowledge Attention", () => {
    it("keeps underlying watch evidence but suppresses duplicate recommendation", () => {
      const assessment = lateSleepAssessment({
        recentCoachActions: [toAttentionAction(actionRecord())],
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.reasonCodes).toContain("recurring_late_sleep");
      expect(assessment.recentCoachActionAcknowledged).toBe(true);
      expect(assessment.recommendedActionType).toBe("continue_observe_known_context");
    });
  });

  describe("CA-C — Follow-up", () => {
    it("memory surfaces unresolved follow-up", () => {
      const memory = buildRecentCoachActionMemory([
        actionRecord({
          id: "fu-1",
          actionType: "follow_up",
          status: "follow_up",
          note: "週五再確認作息是否恢復。",
          resolvedAt: null,
        }),
        actionRecord({
          id: "done-1",
          status: "resolved",
          note: "已解決一次",
          resolvedAt: "2026-08-10T10:00:00.000+08:00",
        }),
      ]);
      expect(memory.unresolvedFollowUps.some((item) => item.id === "fu-1")).toBe(true);
      expect(memory.unresolvedFollowUps.every((item) => item.status === "follow_up")).toBe(true);
    });
  });

  describe("CA-D — Resolve does not permanently close future attention", () => {
    it("resolved action outside window allows future same-reason recommendation", () => {
      const assessment = lateSleepAssessment({
        asOfIso: "2026-08-16T18:00:00.000+08:00",
        recentCoachActions: [
          toAttentionAction(
            actionRecord({
              status: "resolved",
              resolvedAt: "2026-08-11T10:00:00.000+08:00",
              createdAt: "2026-08-11T10:00:00.000+08:00",
            }),
          ),
        ],
      });
      expect(assessment.tier).toBe("watch");
      expect(assessment.recommendedActionType).toBe("ask_late_sleep_reason");
      expect(assessment.recentCoachActionAcknowledged).toBe(false);
    });
  });

  describe("CA-E — Same reason within window", () => {
    it("does not re-fire identical recommendation", () => {
      const assessment = lateSleepAssessment({
        recentCoachActions: [toAttentionAction(actionRecord())],
      });
      expect(assessment.recommendedActionType).toBe("continue_observe_known_context");
    });
  });

  describe("CA-F — Persists after window", () => {
    it("allows re-alert after suppress window", () => {
      const assessment = lateSleepAssessment({
        asOfIso: "2026-08-14T18:00:00.000+08:00",
        recentCoachActions: [
          toAttentionAction(
            actionRecord({
              createdAt: "2026-08-11T10:00:00.000+08:00",
            }),
          ),
        ],
      });
      // 11→14 is 72h > 48h
      expect(assessment.recentCoachActionAcknowledged).toBe(false);
      expect(assessment.recommendedActionType).toBe("ask_late_sleep_reason");
    });
  });

  describe("CA-G — Severity worsens", () => {
    it("suppression does not block escalation to coach_attention recommendation", () => {
      const assessment = lateSleepAssessment({
        finalInterventionLevel: "coach_attention",
        recentCoachActions: [toAttentionAction(actionRecord())],
      });
      expect(assessment.tier).toBe("coach_attention");
      expect(assessment.recentCoachActionAcknowledged).toBe(true);
      expect(assessment.recommendedActionType).not.toBe("continue_observe_known_context");
      expect(assessment.recommendedActionType).toBe("follow_up_unresolved_action");
    });
  });

  describe("CA-H / CA-I — AI memory quality heuristics", () => {
    it("fails when AI re-asks why late sleep after coach recorded overtime context", () => {
      const { generationInput } = buildScenarioDecisionContext("C_watch_pattern");
      const withMemory = {
        ...generationInput,
        recentCoachActionMemory: buildRecentCoachActionMemory([actionRecord()]),
      };
      const bad = evaluateCoachingAiOutputQuality({
        output: sampleOutput({
          coachSummary: "建議詢問他為什麼晚睡。",
          attentionReason: "問問晚睡原因",
          evidence: ["再問一次晚睡原因"],
        }),
        finalInterventionLevel: "watch",
        generationInput: withMemory,
      });
      expect(allQualityChecks(bad).find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status).toBe(
        "fail",
      );

      const good = evaluateCoachingAiOutputQuality({
        output: sampleOutput({
          coachSummary: "已知近期加班影響睡眠，若這週仍持續可一起找可行入睡策略。",
        }),
        finalInterventionLevel: "watch",
        generationInput: withMemory,
      });
      expect(allQualityChecks(good).find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status).toBe(
        "pass",
      );
    });
  });

  describe("CA-J — Authority", () => {
    it("coach optimistic note does not rewrite deterministic outcome status", () => {
      const { generationInput, decisionContext } = buildScenarioDecisionContext("K_weight_down_muscle_loss");
      const withNote = {
        ...generationInput,
        recentCoachActionMemory: buildRecentCoachActionMemory([
          actionRecord({
            note: "我覺得他最近很好。",
            relatedReasonCodes: ["outcome_worsening"],
          }),
        ]),
      };

      const withoutNote = assessCoachingOutcome({ generationInput });
      const withCoachOpinion = assessCoachingOutcome({ generationInput: withNote });

      expect(withCoachOpinion.outcomeStatus).toBe(withoutNote.outcomeStatus);
      expect(withCoachOpinion.outcomeStatus).toBe(decisionContext.outcomeAssessment.outcomeStatus);
      expect(withNote.recentCoachActionMemory?.materialActions[0]?.note).toContain("很好");
    });
  });

  describe("CA-K / CA-L — Permission & customer isolation (contract)", () => {
    it("ownership helper returns Forbidden semantics and portal has no coach-actions surface", async () => {
      // Contract: coach-actions API lives under member-auth enrollments path only.
      const fs = await import("node:fs/promises");
      const portalContext = await fs.readFile(
        new URL("../../../app/api/coaching/portal/[token]/context/route.ts", import.meta.url),
        "utf8",
      );
      expect(portalContext).not.toContain("coach-actions");
      expect(portalContext).not.toContain("coaching_coach_actions");

      const actionRoute = await fs.readFile(
        new URL("../../../app/api/coaching/enrollments/[enrollmentId]/coach-actions/route.ts", import.meta.url),
        "utf8",
      );
      expect(actionRoute).toContain("getMemberIdFromRequest");
      expect(actionRoute).toContain("ownerMemberId: memberId");
    });
  });

  describe("CA-M — Timeline filter 教練紀錄", () => {
    it("filters coach_action events", () => {
      const record = actionRecord();
      const events = buildCoachingTimelineEvents({
        enrollmentId: "enroll-1",
        enrollmentStartedAt: "2026-07-01T00:00:00.000Z",
        baselineBodyRecordId: null,
        asOfLogDate: "2026-08-11",
        journeyStartDate: "2026-08-11",
        logs: [],
        aiOutputs: [],
        bodyRecords: [],
        coachActions: [record],
      });
      const filtered = filterTimelineEvents(events, "coach_action");
      expect(filtered.every((event) => event.type === "coach_action")).toBe(true);
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe("CA-N / CA-O — Fingerprint materiality", () => {
    it("material note changes fingerprint; empty acknowledgement does not", () => {
      const { generationInput } = buildScenarioDecisionContext("C_watch_pattern");
      const baseline = {
        ...generationInput,
        recentCoachActionMemory: null,
      };
      const emptyAck = {
        ...generationInput,
        recentCoachActionMemory: buildRecentCoachActionMemory([
          actionRecord({
            note: null,
            actionType: "acknowledged",
            isMaterial: false,
          }),
        ]),
      };
      const material = {
        ...generationInput,
        recentCoachActionMemory: buildRecentCoachActionMemory([
          actionRecord({
            note: "最近加班造成晚睡",
            isMaterial: true,
          }),
        ]),
      };

      expect(inferCoachActionMaterial({ actionType: "acknowledged", note: null })).toBe(false);
      expect(inferCoachActionMaterial({ actionType: "note", note: "最近加班造成晚睡" })).toBe(true);

      expect(fingerprintCoachingGenerationInput(baseline)).toBe(
        fingerprintCoachingGenerationInput(emptyAck),
      );
      expect(fingerprintCoachingGenerationInput(material)).not.toBe(
        fingerprintCoachingGenerationInput(baseline),
      );
    });
  });
});
