import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
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
  scheduleGo21ReminderIntent,
} from "@/lib/go21/reminders";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { composeGo21OutOfScopeReply } from "@/lib/go21/out-of-scope-reply";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { requireGo21Portal, resolveGo21LifecycleAnchor } from "@/lib/go21/go21-portal";
import { assessCoachingAiV2Safety } from "@/lib/coaching/ai/v2/v2-safety";
import type { Go21ExtractedEvent } from "@/types/go21";

export const runtime = "nodejs";

/**
 * Baki Go 21 chat turn:
 * safety → relevance → NL extract → structured persist → V2 coach brain → reminder intents.
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
    const { portal, enrollment } = await requireGo21Portal(token);
    const body = (await request.json()) as {
      message?: string;
      hasPhoto?: boolean;
      photoUploaded?: boolean;
      mealSlotHint?: "breakfast" | "lunch" | "dinner" | null;
      logDate?: string;
      clientRequestId?: string;
    };
    const message = body.message?.trim() ?? "";
    if ((!message || message.length > 2000) && !body.hasPhoto) {
      return NextResponse.json({ error: "message required (1–2000 chars)." }, { status: 400 });
    }

    // Never trust client customer/owner/enrollment IDs — portal is authoritative.
    const logDate =
      body.logDate && /^\d{4}-\d{2}-\d{2}$/.test(body.logDate)
        ? body.logDate
        : coachingTodayLogDate();

    const previous = await loadPreviousExtraction(portal.enrollmentId);
    const relevance = classifyGo21Relevance(message || "photo");
    const extracted = extractGo21StructuredEvent({
      message,
      messageLogDate: logDate,
      hasPhoto: Boolean(body.hasPhoto),
      previous,
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

    // Safety has priority over out-of-scope cheap path
    if (relevance === "safety") {
      const safety = assessCoachingAiV2Safety({ freeMessage: message });
      const reply =
        safety.safeReply ??
        "你提到的狀況超出我能安全處理的範圍。請先以專業醫療／真人教練為準。";
      await appendPairTurns({
        portal,
        logDate,
        customer: message || "[photo]",
        coach: reply,
        metadata: { relevance: "safety", safety: true },
      });
      return NextResponse.json({
        ok: true,
        coachMessage: reply,
        relevance,
        extracted,
        safetyTriggered: true,
        escalationSuggested: true,
      });
    }

    if (relevance !== "out_of_scope") {
      const applied = await applyGo21StructuredEvent({
        portal,
        extracted,
        rawMessage: message,
      });
      if (applied.errors.length > 0) {
        console.error(
          JSON.stringify({
            event: "go21_structured_apply_errors",
            enrollmentId: portal.enrollmentId,
            errors: applied.errors,
          }),
        );
      }
      // Failed photo upload must not invent meal evidence — client sets photoUploaded after success.
      if (body.hasPhoto && !body.photoUploaded && !extracted.mealSlot) {
        // keep unresolved; no fabricated meal
      }
    }

    if (relevance === "out_of_scope") {
      const redirect = composeGo21OutOfScopeReply(message);
      await appendPairTurns({
        portal,
        logDate,
        customer: message || "[photo]",
        coach: redirect,
        metadata: { relevance: "out_of_scope" },
      });
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
      logDate: extracted.eventDate ?? logDate,
    });

    const generationInput = {
      ...loaded.generationInput,
      todayContext: {
        ...loaded.generationInput.todayContext,
        customerNote: message || loaded.generationInput.todayContext.customerNote,
      },
    };

    // Photo reality: storagePath on meals is the secure reference; V2 free_message still text-led.
    // Vision meal observation remains in the daily job pipeline — do not pretend images are OCR'd here.
    const photoPaths = generationInput.todayContext.primaryMeals
      .filter((m) => m.storagePath)
      .map((m) => m.mealSlot);

    const decisionContext = buildMinimalDecisionContextForFreeMessage({
      generationInput,
      freeMessage:
        message ||
        (body.hasPhoto
          ? photoPaths.length > 0
            ? `傳了餐點照片（${photoPaths.join("、")}）`
            : "傳了一張餐點照片（餐別待確認）"
          : ""),
    });

    if (extracted.hungerMentioned && decisionContext.customerVoice.length === 0) {
      decisionContext.customerVoice.push({
        key: "hunger_reported",
        rawExcerpt: "容易餓",
        evidence: [{ key: "go21_chat", value: true }],
      });
    }
    if (extracted.hydrationQuality === "low") {
      decisionContext.customerVoice.push({
        key: "other_customer_concern",
        rawExcerpt: extracted.hydrationNote ?? "水喝很少",
        evidence: [{ key: "go21_hydration_qualitative", value: "low" }],
      });
    }

    const lifecycleAnchor = resolveGo21LifecycleAnchor(enrollment);
    const dayNumber = loaded.generationInput.profileMemory.daysSinceEnrollmentStart;
    const channel = dayNumber >= 20 ? ("day21" as const) : ("free_message" as const);

    const v2 = await runCoachingAiV2Turn({
      generationInput,
      decisionContext,
      enrollmentStartedAt: lifecycleAnchor,
      plannedEndAt: loaded.enrollmentPlannedEndAt,
      planSnapshot: generationInput.profileMemory.planSnapshot,
      channel,
      freeMessage: message || (body.hasPhoto ? "（照片）" : ""),
      persistToSupabase: true,
    });

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
      photoSlotsWithStorage: photoPaths,
      photoVisionInChat: false,
      lifecycle: {
        dayNumber: v2.observability.lifecycleDay,
        stage: v2.observability.lifecycleStage,
        anchorDate: lifecycleAnchor,
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

async function loadPreviousExtraction(
  enrollmentId: string,
): Promise<Partial<Go21ExtractedEvent> | null> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("coaching_ai_turns")
      .select("content, metadata")
      .eq("enrollment_id", enrollmentId)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.content) return null;
    const today = coachingTodayLogDate();
    return extractGo21StructuredEvent({
      message: String(data.content),
      messageLogDate: today,
    });
  } catch {
    return null;
  }
}

async function appendPairTurns(input: {
  portal: { enrollmentId: string; customerId: string; ownerMemberId: string };
  logDate: string;
  customer: string;
  coach: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const store = getSharedInMemoryV2Store();
  await store.appendTurn({
    enrollmentId: input.portal.enrollmentId,
    customerId: input.portal.customerId,
    ownerMemberId: input.portal.ownerMemberId,
    logDate: input.logDate,
    role: "customer",
    channel: "free_message",
    content: input.customer,
  });
  await store.appendTurn({
    enrollmentId: input.portal.enrollmentId,
    customerId: input.portal.customerId,
    ownerMemberId: input.portal.ownerMemberId,
    logDate: input.logDate,
    role: "coach",
    channel: "free_message",
    content: input.coach,
    intention: "acknowledge",
    metadata: input.metadata,
  });
  try {
    const supabase = createSupabaseServiceClient();
    await supabase.from("coaching_ai_turns").insert([
      {
        enrollment_id: input.portal.enrollmentId,
        customer_id: input.portal.customerId,
        owner_member_id: input.portal.ownerMemberId,
        log_date: input.logDate,
        role: "customer",
        channel: "free_message",
        content: input.customer,
      },
      {
        enrollment_id: input.portal.enrollmentId,
        customer_id: input.portal.customerId,
        owner_member_id: input.portal.ownerMemberId,
        log_date: input.logDate,
        role: "coach",
        channel: "free_message",
        content: input.coach,
        intention: "acknowledge",
        metadata: input.metadata,
      },
    ]);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_turn_persist_failed",
        enrollmentId: input.portal.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function scheduleRemindersFromMeta(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  openLoopOps: Array<{ op: string; subject?: string; dueLogDate?: string | null; id?: string }>;
  dayNumber: number | null;
}): Promise<void> {
  for (const op of input.openLoopOps) {
    if (op.op !== "create" || !op.subject) continue;
    const dueDate = op.dueLogDate || addCalendarDays(input.logDate, 1);
    const desired = new Date(`${dueDate}T16:00:00+08:00`);
    const dueAt = nextGo21DeliveryAt({ desiredAt: desired });
    await scheduleGo21ReminderIntent({
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      kind: "open_loop",
      dueAt,
      messagePreview: buildDeterministicReminderPreview({
        kind: "open_loop",
        openLoopSubject: op.subject,
      }),
      contextJson: { subject: op.subject, sourceLogDate: input.logDate },
      relatedOpenLoopId: op.id ?? null,
    });
  }

  const measurementKind =
    input.dayNumber != null ? shouldScheduleMeasurementReminder(input.dayNumber) : null;
  if (measurementKind) {
    const desired = new Date(`${input.logDate}T10:00:00+08:00`);
    const dueAt = nextGo21DeliveryAt({ desiredAt: desired });
    await scheduleGo21ReminderIntent({
      enrollmentId: input.enrollmentId,
      customerId: input.customerId,
      ownerMemberId: input.ownerMemberId,
      kind: measurementKind,
      dueAt,
      messagePreview: buildDeterministicReminderPreview({
        kind: measurementKind,
        dayNumber: input.dayNumber,
      }),
      contextJson: { dayNumber: input.dayNumber },
    });
  }
}
