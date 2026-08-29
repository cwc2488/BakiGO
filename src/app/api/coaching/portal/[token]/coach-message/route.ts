import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { isCoachingAiV2Enabled, runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { buildMinimalDecisionContextForFreeMessage } from "@/lib/coaching/ai/v2/minimal-decision-context";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";

export const runtime = "nodejs";

/**
 * Freeform conversational turn (no daily log required).
 * Uses V2 memory + freeform coach generation.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }
  if (!isCoachingAiV2Enabled()) {
    return NextResponse.json({ error: "AI Coach V2 is not enabled." }, { status: 409 });
  }

  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const body = (await request.json()) as { message?: string; logDate?: string };
    const message = body.message?.trim() ?? "";
    if (!message || message.length > 2000) {
      return NextResponse.json({ error: "message required (1–2000 chars)." }, { status: 400 });
    }

    const logDate = body.logDate && /^\d{4}-\d{2}-\d{2}$/.test(body.logDate)
      ? body.logDate
      : coachingTodayLogDate();

    const loaded = await loadAuthoritativeCoachingGenerationInput({
      enrollmentId: portal.enrollmentId,
      ownerMemberId: portal.ownerMemberId,
      logDate,
    });

    // Overlay free message into today context note for safety / voice extraction.
    const generationInput = {
      ...loaded.generationInput,
      todayContext: {
        ...loaded.generationInput.todayContext,
        customerNote: message,
      },
    };

    const decisionContext = buildMinimalDecisionContextForFreeMessage({
      generationInput,
      freeMessage: message,
    });

    const v2 = await runCoachingAiV2Turn({
      generationInput,
      decisionContext,
      enrollmentStartedAt: loaded.enrollmentStartedAt,
      plannedEndAt: loaded.enrollmentPlannedEndAt,
      planSnapshot: generationInput.profileMemory.planSnapshot,
      channel: "free_message",
      freeMessage: message,
      persistToSupabase: true,
    });

    return NextResponse.json({
      ok: true,
      logDate,
      coachMessage: v2.draft.coachMessage,
      intention: v2.draft.meta.intention,
      lifecycle: {
        dayNumber: v2.observability.lifecycleDay,
        stage: v2.observability.lifecycleStage,
      },
      safetyTriggered: v2.draft.meta.safetyTriggered,
      escalationSuggested: v2.draft.meta.escalationSuggested,
    });
  } catch (error) {
    const msg = toCoachingApiErrorMessage(error, "Failed to send coach message.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
