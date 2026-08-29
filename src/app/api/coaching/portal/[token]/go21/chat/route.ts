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
import {
  runGo21RealtimeVision,
  composeGo21VisionFreeMessage,
  type Go21RealtimeVisionResult,
} from "@/lib/go21/realtime-vision";
import {
  buildGo21GoalSnapshot,
  loadGo21GoalRecord,
  saveGo21Goal,
} from "@/lib/go21/goal";
import { buildGo21CoachGenerationContext } from "@/lib/go21/coach-context";
import {
  assessGo21Disengagement,
  buildGo21CustomerDisplayContent,
  detectPhotoFoodCorrection,
} from "@/lib/go21/conversation-quality";
import {
  acceptGo21CustomerTurn,
  findGo21TurnsByClientRequestId,
  loadRecentVisionEvidenceFromTurns,
} from "@/lib/coaching/ai/v2/v2-supabase-store";
import type { Go21ExtractedEvent } from "@/types/go21";
import type { CoachingMealSlot } from "@/types/coaching";
import {
  categorizeGo21GenerationError,
  logGo21ChatDiagnostic,
  newGo21ChatCorrelationId,
  sanitizeGo21ChatErrorMessage,
  type Go21ChatStage,
} from "@/lib/go21/chat-diagnostics";

export const runtime = "nodejs";

/**
 * Baki Go 21 chat turn:
 * safety → relevance → NL extract → structured persist → accept customer → V2/V3 coach → reminder intents.
 *
 * Durability: customer acceptance is independent of AI generation success.
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

  const correlationId = newGo21ChatCorrelationId();
  let stage: Go21ChatStage = "auth";
  let enrollmentIdForLog: string | undefined;
  let clientRequestIdPresent = false;
  let customerPersisted = false;
  let generationStarted = false;
  let assistantPersisted = false;
  let acceptedCustomerTurnId: string | null = null;

  try {
    stage = "auth";
    const { token } = await context.params;
    const { portal, enrollment } = await requireGo21Portal(token);
    enrollmentIdForLog = portal.enrollmentId;

    stage = "validate";
    const body = (await request.json()) as {
      message?: string;
      hasPhoto?: boolean;
      photoUploaded?: boolean;
      mealSlotHint?: "breakfast" | "lunch" | "dinner" | null;
      logDate?: string;
      clientRequestId?: string;
      /** Explicit coach-response retry after customer was already accepted. */
      retryAssistant?: boolean;
    };
    const message = body.message?.trim() ?? "";
    if ((!message || message.length > 2000) && !body.hasPhoto) {
      return NextResponse.json({ error: "message required (1–2000 chars)." }, { status: 400 });
    }

    const clientRequestId = body.clientRequestId?.trim() || null;
    clientRequestIdPresent = Boolean(clientRequestId);

    stage = "idempotency_lookup";
    if (clientRequestId) {
      const prior = await findGo21TurnsByClientRequestId({
        enrollmentId: portal.enrollmentId,
        clientRequestId,
      });
      if (prior.coach) {
        return NextResponse.json({
          ok: true,
          customerAccepted: true,
          customerTurnId: prior.customer?.id ?? null,
          clientRequestId,
          assistantStatus: "ok",
          coachMessage: prior.coach.content,
          duplicate: true,
          relevance: "in_scope",
        });
      }
      if (prior.customer) {
        customerPersisted = true;
        acceptedCustomerTurnId = prior.customer.id;
      }
    }

    // Never trust client customer/owner/enrollment IDs — portal is authoritative.
    const logDate =
      body.logDate && /^\d{4}-\d{2}-\d{2}$/.test(body.logDate)
        ? body.logDate
        : coachingTodayLogDate();

    const customerDisplayContent = buildGo21CustomerDisplayContent({
      message,
      hasPhoto: Boolean(body.hasPhoto),
    });

    stage = "relevance";
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
      const accepted = await acceptCustomerThenCoach({
        portal,
        logDate,
        customer: customerDisplayContent,
        coach: reply,
        metadata: { relevance: "safety", safety: true },
        clientRequestId,
        channel: "free_message",
        existingCustomerTurnId: acceptedCustomerTurnId,
      });
      customerPersisted = accepted.customerPersisted;
      assistantPersisted = accepted.assistantPersisted;
      return NextResponse.json({
        ok: true,
        customerAccepted: accepted.customerPersisted,
        customerTurnId: accepted.customerTurnId,
        clientRequestId,
        assistantStatus: accepted.assistantPersisted ? "ok" : "failed",
        coachMessage: reply,
        relevance,
        extracted,
        safetyTriggered: true,
        escalationSuggested: true,
      });
    }

    // Disengagement: brief human reply (after safety). Do not motivational-essay.
    const disengagement = assessGo21Disengagement(message);
    if (disengagement.detected && disengagement.briefReply && relevance !== "out_of_scope") {
      const accepted = await acceptCustomerThenCoach({
        portal,
        logDate,
        customer: customerDisplayContent,
        coach: disengagement.briefReply,
        metadata: {
          relevance: "in_scope",
          disengagement: true,
          wantsToStop: disengagement.wantsToStop,
        },
        clientRequestId,
        channel: "free_message",
        existingCustomerTurnId: acceptedCustomerTurnId,
      });
      customerPersisted = accepted.customerPersisted;
      assistantPersisted = accepted.assistantPersisted;
      return NextResponse.json({
        ok: true,
        customerAccepted: accepted.customerPersisted,
        customerTurnId: accepted.customerTurnId,
        clientRequestId,
        assistantStatus: accepted.assistantPersisted ? "ok" : "failed",
        coachMessage: disengagement.briefReply,
        relevance: "in_scope",
        extracted,
        disengagement: true,
      });
    }

    stage = "structured_apply";
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
    }

    if (relevance === "out_of_scope") {
      const redirect = composeGo21OutOfScopeReply(message);
      const accepted = await acceptCustomerThenCoach({
        portal,
        logDate,
        customer: customerDisplayContent,
        coach: redirect,
        metadata: { relevance: "out_of_scope" },
        clientRequestId,
        channel: "free_message",
        existingCustomerTurnId: acceptedCustomerTurnId,
      });
      customerPersisted = accepted.customerPersisted;
      assistantPersisted = accepted.assistantPersisted;
      return NextResponse.json({
        ok: true,
        customerAccepted: accepted.customerPersisted,
        customerTurnId: accepted.customerTurnId,
        clientRequestId,
        assistantStatus: accepted.assistantPersisted ? "ok" : "failed",
        coachMessage: redirect,
        relevance,
        extracted,
        structured: { dailyLogUpdated: false, bodyRecordCreated: false },
      });
    }

    stage = "context_hydrate";
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

    const eventLogDate = extracted.eventDate ?? logDate;
    const mealSlotUnresolved =
      Boolean(body.hasPhoto) &&
      !extracted.mealSlot &&
      !(body.mealSlotHint && ["breakfast", "lunch", "dinner"].includes(body.mealSlotHint));

    const preferredSlot: CoachingMealSlot | null =
      (extracted.mealSlot as CoachingMealSlot | null) ||
      body.mealSlotHint ||
      (mealSlotUnresolved ? "snacks" : null);

    let vision: Go21RealtimeVisionResult = {
      ran: false,
      reusedCache: false,
      failed: false,
      failureReason: null,
      storagePath: null,
      mealSlotResolved: null,
      mealSlotUnresolved,
      observations: [],
      evidenceSummary: null,
      source: "none",
      usage: { inputTokens: 0, outputTokens: 0, imageCount: 0 },
    };

    stage = "vision";
    if (body.hasPhoto && body.photoUploaded) {
      vision = await runGo21RealtimeVision({
        portal,
        generationInput,
        logDate: eventLogDate,
        preferredSlot,
        mealSlotUnresolved,
      });
    } else if (body.hasPhoto && !body.photoUploaded) {
      console.info(
        JSON.stringify({
          event: "go21_photo_claimed_without_upload",
          enrollmentId: portal.enrollmentId,
        }),
      );
    }

    const freeMessage = composeGo21VisionFreeMessage({
      customerMessage: message,
      hasPhoto: Boolean(body.hasPhoto),
      vision,
    });

    const foodCorrection = detectPhotoFoodCorrection(message);
    const priorVision = await loadRecentVisionEvidenceFromTurns({
      enrollmentId: portal.enrollmentId,
      limit: 4,
    });
    const recentVisionObservations = [
      ...(vision.evidenceSummary
        ? [{ summary: vision.evidenceSummary, correction: foodCorrection }]
        : []),
      ...priorVision.map((v) => ({
        summary: v.correction?.trim() ? `${v.summary}（顧客更正：${v.correction}）` : v.summary,
        correction: v.correction,
      })),
    ].slice(0, 3);

    stage = "goal_context";
    let goalConfirmHint: string | null = null;
    let go21Goal: ReturnType<typeof buildGo21CoachGenerationContext>["go21Goal"] = null;
    try {
      const refinement = extracted.goalRefinement;
      const targetFromExtract = extracted.targetWeightKg;
      let goalRecord = await loadGo21GoalRecord(portal.enrollmentId);

      if (refinement && refinement.confidence === "high" && !refinement.needsConfirmation) {
        const nextPersonal =
          refinement.personalGoal?.trim() || goalRecord?.current.personalGoal || "";
        const nextDirection =
          refinement.primaryDirection ?? goalRecord?.current.primaryDirection ?? "other";
        const nextTarget = refinement.clearTargetWeight
          ? null
          : refinement.targetWeightKg ??
            targetFromExtract ??
            goalRecord?.current.targetWeightKg ??
            null;
        if (nextPersonal) {
          const snapshot = buildGo21GoalSnapshot({
            primaryDirection: nextDirection,
            personalGoal: nextPersonal,
            targetWeightKg: nextTarget,
            source: "chat_confirmed",
          });
          const saved = await saveGo21Goal({
            enrollmentId: portal.enrollmentId,
            customerId: portal.customerId,
            ownerMemberId: portal.ownerMemberId,
            snapshot,
            reason: "chat_high_confidence",
          });
          goalRecord = saved.record;
          if (saved.safety.message) goalConfirmHint = saved.safety.message;
        }
      } else if (targetFromExtract != null && goalRecord) {
        const snapshot = buildGo21GoalSnapshot({
          primaryDirection: goalRecord.current.primaryDirection,
          personalGoal: goalRecord.current.personalGoal,
          targetWeightKg: targetFromExtract,
          source: "chat_confirmed",
        });
        const saved = await saveGo21Goal({
          enrollmentId: portal.enrollmentId,
          customerId: portal.customerId,
          ownerMemberId: portal.ownerMemberId,
          snapshot,
          reason: "target_weight_update",
        });
        goalRecord = saved.record;
      } else if (refinement?.needsConfirmation) {
        goalConfirmHint =
          "顧客可能在調整 21 天方向；若語意夠明確可自然確認後再改，不要默默覆寫。";
      }

      const coachCtx = buildGo21CoachGenerationContext({ goalRecord });
      go21Goal = coachCtx.go21Goal;
    } catch (goalError) {
      console.error(
        JSON.stringify({
          event: "go21_goal_chat_path_failed",
          enrollmentId: portal.enrollmentId,
          error: goalError instanceof Error ? goalError.message : String(goalError),
        }),
      );
    }

    const enrichedFreeMessage = goalConfirmHint
      ? `${freeMessage}\n\n[系統｜目標]\n${goalConfirmHint}`
      : freeMessage;

    const decisionContext = buildMinimalDecisionContextForFreeMessage({
      generationInput,
      freeMessage: enrichedFreeMessage,
      mealObservations: vision.observations,
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

    const customerMetadata: Record<string, unknown> = {
      ...(vision.storagePath
        ? {
            photoStoragePath: vision.storagePath,
            mealSlotUnresolved,
            visionSource: vision.source,
            visionReusedCache: vision.reusedCache,
            visionEvidenceSummary: vision.evidenceSummary,
          }
        : {}),
      ...(foodCorrection ? { customerCorrection: foodCorrection } : {}),
      ...(clientRequestId ? { clientRequestId } : {}),
    };

    // STEP B — durable customer acceptance (independent of AI).
    stage = "customer_persist";
    if (!acceptedCustomerTurnId) {
      const accepted = await acceptGo21CustomerTurn({
        enrollmentId: portal.enrollmentId,
        customerId: portal.customerId,
        ownerMemberId: portal.ownerMemberId,
        logDate,
        content: customerDisplayContent,
        channel: body.hasPhoto ? "photo" : "free_message",
        metadata: customerMetadata,
        clientRequestId,
      });
      if (!accepted.ok || !accepted.customerTurnId) {
        logGo21ChatDiagnostic({
          stage: "customer_persist",
          correlationId,
          enrollmentId: enrollmentIdForLog,
          clientRequestIdPresent,
          customerPersisted: false,
          generationStarted: false,
          assistantPersisted: false,
          errorName: "CustomerPersistError",
          errorMessage: sanitizeGo21ChatErrorMessage(accepted.errorMessage),
          errorCategory: "persist_failed",
          providerStatus: null,
        });
        return NextResponse.json(
          {
            ok: false,
            customerAccepted: false,
            clientRequestId,
            assistantStatus: "skipped",
            error: "訊息還無法送出，請重試",
          },
          { status: 503 },
        );
      }
      customerPersisted = true;
      acceptedCustomerTurnId = accepted.customerTurnId;
      if (accepted.coachTurn) {
        assistantPersisted = true;
        return NextResponse.json({
          ok: true,
          customerAccepted: true,
          customerTurnId: accepted.customerTurnId,
          clientRequestId,
          assistantStatus: "ok",
          coachMessage: accepted.coachTurn.content,
          duplicate: true,
          relevance,
          extracted,
        });
      }
    } else {
      customerPersisted = true;
    }

    stage = "generation";
    generationStarted = true;
    let v2: Awaited<ReturnType<typeof runCoachingAiV2Turn>>;
    try {
      v2 = await runCoachingAiV2Turn({
        generationInput,
        decisionContext,
        enrollmentStartedAt: lifecycleAnchor,
        plannedEndAt: loaded.enrollmentPlannedEndAt,
        planSnapshot: generationInput.profileMemory.planSnapshot,
        channel,
        freeMessage: enrichedFreeMessage,
        customerDisplayContent,
        customerChannel: body.hasPhoto ? "photo" : "free_message",
        customerMetadata,
        clientRequestId,
        ownerMemberId: portal.ownerMemberId,
        persistToSupabase: true,
        hydrateFromSupabase: true,
        go21Goal,
        recentVisionObservations,
        customerAlreadyAccepted: true,
        existingCustomerTurnId: acceptedCustomerTurnId,
      });
    } catch (genError) {
      const categorized = categorizeGo21GenerationError(genError);
      logGo21ChatDiagnostic({
        stage: "generation",
        correlationId,
        enrollmentId: enrollmentIdForLog,
        clientRequestIdPresent,
        customerPersisted: true,
        generationStarted: true,
        assistantPersisted: false,
        errorName: genError instanceof Error ? genError.name : "Error",
        errorMessage: categorized.message,
        errorCategory: categorized.category,
        providerStatus: categorized.providerStatus,
      });
      // Customer message is already sent — do not HTTP 500 the acceptance.
      return NextResponse.json({
        ok: true,
        customerAccepted: true,
        customerTurnId: acceptedCustomerTurnId,
        clientRequestId,
        assistantStatus: "failed",
        assistantError: {
          category: categorized.category,
          retryable: categorized.retryable,
          message: "教練剛剛沒接上",
        },
        coachMessage: null,
        relevance,
        extracted,
        vision: {
          ran: vision.ran,
          reusedCache: vision.reusedCache,
          failed: vision.failed,
          source: vision.source,
          mealSlotUnresolved: vision.mealSlotUnresolved,
          evidenceSummary: vision.evidenceSummary,
          imageCount: vision.usage.imageCount,
        },
        photoVisionInChat: vision.ran && !vision.failed && Boolean(vision.evidenceSummary),
        lifecycle: {
          dayNumber: loaded.generationInput.profileMemory.daysSinceEnrollmentStart,
          stage: null,
          anchorDate: lifecycleAnchor,
        },
      });
    }

    stage = "assistant_persist";
    const coachMessage = v2.draft.coachMessage;
    assistantPersisted = Boolean(v2.persistResult?.coachTurnId || v2.persistResult?.coachMessage);

    if (!assistantPersisted && !v2.persistResult?.duplicate) {
      const categorized = categorizeGo21GenerationError(new Error("assistant persist failed"));
      logGo21ChatDiagnostic({
        stage: "assistant_persist",
        correlationId,
        enrollmentId: enrollmentIdForLog,
        clientRequestIdPresent,
        customerPersisted: true,
        generationStarted: true,
        assistantPersisted: false,
        errorName: "AssistantPersistError",
        errorMessage: categorized.message,
        errorCategory: "persist_failed",
        providerStatus: null,
      });
      return NextResponse.json({
        ok: true,
        customerAccepted: true,
        customerTurnId: acceptedCustomerTurnId,
        clientRequestId,
        assistantStatus: "failed",
        assistantError: {
          category: "persist_failed",
          retryable: true,
          message: "教練剛剛沒接上",
        },
        coachMessage: null,
        relevance,
        extracted,
      });
    }

    stage = "reminders";
    await scheduleRemindersFromMeta({
      enrollmentId: portal.enrollmentId,
      customerId: portal.customerId,
      ownerMemberId: portal.ownerMemberId,
      logDate,
      openLoopOps: v2.draft.meta.openLoopOps,
      dayNumber: v2.observability.lifecycleDay,
    });

    stage = "serialize";
    return NextResponse.json({
      ok: true,
      customerAccepted: true,
      customerTurnId: acceptedCustomerTurnId,
      clientRequestId,
      assistantStatus: "ok",
      coachMessage,
      intention: v2.draft.meta.intention,
      relevance,
      extracted,
      duplicate: v2.persistResult?.duplicate ?? false,
      vision: {
        ran: vision.ran,
        reusedCache: vision.reusedCache,
        failed: vision.failed,
        source: vision.source,
        mealSlotUnresolved: vision.mealSlotUnresolved,
        evidenceSummary: vision.evidenceSummary,
        imageCount: vision.usage.imageCount,
      },
      photoVisionInChat: vision.ran && !vision.failed && Boolean(vision.evidenceSummary),
      lifecycle: {
        dayNumber: v2.observability.lifecycleDay,
        stage: v2.observability.lifecycleStage,
        anchorDate: lifecycleAnchor,
      },
      safetyTriggered: v2.draft.meta.safetyTriggered,
      escalationSuggested: v2.draft.meta.escalationSuggested,
    });
  } catch (error) {
    const categorized = categorizeGo21GenerationError(error);
    logGo21ChatDiagnostic({
      stage,
      correlationId,
      enrollmentId: enrollmentIdForLog,
      clientRequestIdPresent,
      customerPersisted,
      generationStarted,
      assistantPersisted,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: categorized.message,
      errorCategory: categorized.category,
      providerStatus: categorized.providerStatus,
    });

    // If customer was already accepted, never report the send as a hard failure.
    if (customerPersisted && acceptedCustomerTurnId) {
      return NextResponse.json({
        ok: true,
        customerAccepted: true,
        customerTurnId: acceptedCustomerTurnId,
        clientRequestId: null,
        assistantStatus: "failed",
        assistantError: {
          category: categorized.category,
          retryable: true,
          message: "教練剛剛沒接上",
        },
        coachMessage: null,
      });
    }

    const errMessage = toCoachingApiErrorMessage(error, "無法送出訊息");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        customerAccepted: false,
        assistantStatus: "skipped",
        error: errMessage,
      },
      { status },
    );
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

async function acceptCustomerThenCoach(input: {
  portal: { enrollmentId: string; customerId: string; ownerMemberId: string };
  logDate: string;
  customer: string;
  coach: string;
  metadata: Record<string, unknown>;
  clientRequestId?: string | null;
  channel: "free_message" | "photo";
  existingCustomerTurnId?: string | null;
}): Promise<{
  customerPersisted: boolean;
  assistantPersisted: boolean;
  customerTurnId: string | null;
}> {
  let customerTurnId = input.existingCustomerTurnId ?? null;
  let customerPersisted = Boolean(customerTurnId);

  if (!customerTurnId) {
    const accepted = await acceptGo21CustomerTurn({
      enrollmentId: input.portal.enrollmentId,
      customerId: input.portal.customerId,
      ownerMemberId: input.portal.ownerMemberId,
      logDate: input.logDate,
      content: input.customer,
      channel: input.channel,
      metadata: input.metadata,
      clientRequestId: input.clientRequestId,
    });
    customerPersisted = accepted.ok && Boolean(accepted.customerTurnId);
    customerTurnId = accepted.customerTurnId;
    if (accepted.coachTurn) {
      return {
        customerPersisted: true,
        assistantPersisted: true,
        customerTurnId,
      };
    }
  }

  const store = getSharedInMemoryV2Store();
  await store.appendTurn({
    enrollmentId: input.portal.enrollmentId,
    customerId: input.portal.customerId,
    ownerMemberId: input.portal.ownerMemberId,
    logDate: input.logDate,
    role: "customer",
    channel: input.channel,
    content: input.customer,
    metadata: {
      ...input.metadata,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    },
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
    metadata: {
      ...input.metadata,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      ...(customerTurnId ? { replyToCustomerTurnId: customerTurnId } : {}),
    },
  });

  let assistantPersisted = false;
  try {
    if (input.clientRequestId) {
      const prior = await findGo21TurnsByClientRequestId({
        enrollmentId: input.portal.enrollmentId,
        clientRequestId: input.clientRequestId,
      });
      if (prior.coach) {
        return {
          customerPersisted: true,
          assistantPersisted: true,
          customerTurnId: prior.customer?.id ?? customerTurnId,
        };
      }
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("coaching_ai_turns")
      .insert({
        enrollment_id: input.portal.enrollmentId,
        customer_id: input.portal.customerId,
        owner_member_id: input.portal.ownerMemberId,
        log_date: input.logDate,
        role: "coach",
        channel: "free_message",
        content: input.coach,
        intention: "acknowledge",
        metadata: {
          ...input.metadata,
          ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
          ...(customerTurnId ? { replyToCustomerTurnId: customerTurnId } : {}),
        },
      })
      .select("id")
      .maybeSingle();
    assistantPersisted = !error && Boolean(data?.id);
    if (error) {
      console.error(
        JSON.stringify({
          event: "go21_coach_turn_persist_failed",
          enrollmentId: input.portal.enrollmentId,
          error: error.message,
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_turn_persist_failed",
        enrollmentId: input.portal.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return { customerPersisted, assistantPersisted, customerTurnId };
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
