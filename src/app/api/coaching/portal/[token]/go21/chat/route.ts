import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, resolveActiveCoachingPortal } from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { applyGo21StructuredEvent } from "@/lib/go21/apply-structured-event";
import { classifyGo21Relevance } from "@/lib/go21/relevance";
import { isCoachingAiV2Enabled, runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { buildMinimalDecisionContextForFreeMessage } from "@/lib/coaching/ai/v2/minimal-decision-context";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import {
  nextGo21DeliveryAt,
  buildDeterministicReminderPreview,
  shouldScheduleMeasurementReminder,
} from "@/lib/go21/reminders";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { composeGo21OutOfScopeReply } from "@/lib/go21/out-of-scope-reply";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";

export const runtime = "nodejs";

/**
 * Baki Go 21 chat turn:
 * relevance → NL extract → structured persist → V2 coach brain → optional reminder intents.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  if (!isCoachingAiV2Enabled()) {
    return NextResponse.json({ error: "AI Coach V2 is not enabled." }, { status: 409 });
  }

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const body = (await request.json()) as {
      message?: string;
      hasPhoto?: boolean;
      mealSlotHint?: "breakfast" | "lunch" | "dinner" | null;
      logDate?: string;
    };
    const message = body.message?.trim() ?? "";
    if ((!message || message.length > 2000) && !body.hasPhoto) {
      return NextResponse.json({ error: "message required (1–2000 chars)." }, { status: 400 });
    }

    const logDate =
      body.logDate && /^\d{4}-\d{2}-\d{2}$/.test(body.logDate)
        ? body.logDate
        : coachingTodayLogDate();

    const relevance = classifyGo21Relevance(message || "photo");
    const extracted = extractGo21StructuredEvent({
      message,
      messageLogDate: logDate,
      hasPhoto: Boolean(body.hasPhoto),
    });
    if (body.mealSlotHint && !extracted.mealSlot) {
      extracted.mealSlot = body.mealSlotHint;
      extracted.confidence = "high";
      extracted.unresolvedQuestions = extracted.unresolvedQuestions.filter(
        (q) => q !== "meal_slot_unknown",
      );
      if (!extracted.mealNote && message) extracted.mealNote = message;
      if (!extracted.mealNote && body.hasPhoto) extracted.mealNote = `[photo] ${body.mealSlotHint}`;
    }

    if (relevance !== "out_of_scope") {
      await applyGo21StructuredEvent({
        portal,
        extracted,
        rawMessage: message,
      });
    }

    // Out of scope: short natural redirect — no deep coaching / no durable memory pollution
    if (relevance === "out_of_scope") {
      const redirect = composeGo21OutOfScopeReply(message);
      const store = getSharedInMemoryV2Store();
      await store.appendTurn({
        enrollmentId: portal.enrollmentId,
        customerId: portal.customerId,
        ownerMemberId: portal.ownerMemberId,
        logDate,
        role: "customer",
        channel: "free_message",
        content: message || "[photo]",
      });
      await store.appendTurn({
        enrollmentId: portal.enrollmentId,
        customerId: portal.customerId,
        ownerMemberId: portal.ownerMemberId,
        logDate,
        role: "coach",
        channel: "free_message",
        content: redirect,
        intention: "acknowledge",
        metadata: { relevance: "out_of_scope" },
      });
      try {
        const supabase = createSupabaseServiceClient();
        await supabase.from("coaching_ai_turns").insert([
          {
            enrollment_id: portal.enrollmentId,
            customer_id: portal.customerId,
            owner_member_id: portal.ownerMemberId,
            log_date: logDate,
            role: "customer",
            channel: "free_message",
            content: message || "[photo]",
          },
          {
            enrollment_id: portal.enrollmentId,
            customer_id: portal.customerId,
            owner_member_id: portal.ownerMemberId,
            log_date: logDate,
            role: "coach",
            channel: "free_message",
            content: redirect,
            intention: "acknowledge",
            metadata: { relevance: "out_of_scope" },
          },
        ]);
      } catch {
        /* turns table may be pending */
      }
      return NextResponse.json({
        ok: true,
        coachMessage: redirect,
        relevance,
        extracted,
        structured: { dailyLogUpdated: false, bodyRecordCreated: false },
      });
    }

    const loaded = await loadAuthoritativeCoachingGenerationInput({
      enrollmentId: portal.enrollmentId,
      ownerMemberId: portal.ownerMemberId,
      logDate,
    });

    const generationInput = {
      ...loaded.generationInput,
      todayContext: {
        ...loaded.generationInput.todayContext,
        customerNote: message || loaded.generationInput.todayContext.customerNote,
      },
    };

    const decisionContext = buildMinimalDecisionContextForFreeMessage({
      generationInput,
      freeMessage: message || (body.hasPhoto ? "傳了一張餐點照片" : ""),
    });

    // If we have meal observations from structured extract, lightly annotate voice
    if (extracted.hungerMentioned && decisionContext.customerVoice.length === 0) {
      decisionContext.customerVoice.push({
        key: "hunger_reported",
        rawExcerpt: "容易餓",
        evidence: [{ key: "go21_chat", value: true }],
      });
    }

    const channel =
      loaded.generationInput.profileMemory.daysSinceEnrollmentStart >= 20
        ? ("day21" as const)
        : ("free_message" as const);

    const v2 = await runCoachingAiV2Turn({
      generationInput,
      decisionContext,
      enrollmentStartedAt: loaded.enrollmentStartedAt,
      plannedEndAt: loaded.enrollmentPlannedEndAt,
      planSnapshot: generationInput.profileMemory.planSnapshot,
      channel,
      freeMessage: message || (body.hasPhoto ? "（照片）" : ""),
      persistToSupabase: true,
    });

    // Schedule reminder intents from open-loop ops (deterministic, cheap)
    await scheduleRemindersFromMeta({
      enrollmentId: portal.enrollmentId,
      customerId: portal.customerId,
      ownerMemberId: portal.ownerMemberId,
      logDate,
      openLoopOps: v2.draft.meta.openLoopOps,
      dayNumber: v2.observability.lifecycleDay,
    });

    return NextResponse.json({
      ok: true,
      coachMessage: v2.draft.coachMessage,
      intention: v2.draft.meta.intention,
      relevance,
      extracted,
      lifecycle: {
        dayNumber: v2.observability.lifecycleDay,
        stage: v2.observability.lifecycleStage,
      },
      safetyTriggered: v2.draft.meta.safetyTriggered,
      escalationSuggested: v2.draft.meta.escalationSuggested,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法送出訊息");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function scheduleRemindersFromMeta(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  openLoopOps: Array<{ op: string; subject?: string; dueLogDate?: string | null }>;
  dayNumber: number | null;
}): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient();
    for (const op of input.openLoopOps) {
      if (op.op !== "create" || !op.subject) continue;
      const dueDate = op.dueLogDate || addCalendarDays(input.logDate, 1);
      const desired = new Date(`${dueDate}T16:00:00+08:00`);
      const dueAt = nextGo21DeliveryAt({ desiredAt: desired });
      await supabase.from("coaching_ai_reminders").insert({
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: input.ownerMemberId,
        kind: "open_loop",
        status: "scheduled",
        due_at: dueAt.toISOString(),
        message_preview: buildDeterministicReminderPreview({
          kind: "open_loop",
          openLoopSubject: op.subject,
        }),
        context_json: { subject: op.subject, sourceLogDate: input.logDate },
      });
    }

    const measurementKind =
      input.dayNumber != null ? shouldScheduleMeasurementReminder(input.dayNumber) : null;
    if (measurementKind) {
      const desired = new Date(`${input.logDate}T10:00:00+08:00`);
      const dueAt = nextGo21DeliveryAt({ desiredAt: desired });
      await supabase.from("coaching_ai_reminders").insert({
        enrollment_id: input.enrollmentId,
        customer_id: input.customerId,
        owner_member_id: input.ownerMemberId,
        kind: measurementKind,
        status: "scheduled",
        due_at: dueAt.toISOString(),
        message_preview: buildDeterministicReminderPreview({
          kind: measurementKind,
          dayNumber: input.dayNumber,
        }),
        context_json: { dayNumber: input.dayNumber },
      });
    }
  } catch {
    // Reminder table may not be migrated yet — chat must still succeed.
  }
}
