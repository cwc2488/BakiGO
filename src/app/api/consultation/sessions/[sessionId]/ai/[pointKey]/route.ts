import { NextResponse } from "next/server";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import {
  generateBarrierInsight,
  generateMotivationInsight,
  getConsultationAiOutput,
} from "@/lib/consultation/ai/consultation-ai-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  CONSULTATION_AI_POINT_KEYS,
  type ConsultationAiPointKey,
} from "@/types/consultation-ai";
import type { ConsultationBarriersData, ConsultationReadinessData } from "@/types/consultation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; pointKey: string }>;
};

function parsePointKey(value: string): ConsultationAiPointKey | null {
  if (value === CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT) {
    return CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT;
  }
  if (value === CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT) {
    return CONSULTATION_AI_POINT_KEYS.BARRIER_INSIGHT;
  }
  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const { sessionId, pointKey: rawPointKey } = await context.params;
    const pointKey = parsePointKey(rawPointKey);
    if (!pointKey) {
      return NextResponse.json({ error: "Invalid AI point key." }, { status: 400 });
    }

    const output = await getConsultationAiOutput({ sessionId, memberId, pointKey });
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to load AI insight.");
    const status = message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

type PostBody = {
  regenerate?: boolean;
  barrierDraft?: ConsultationBarriersData;
  readinessDraft?: Pick<
    ConsultationReadinessData,
    "readyIfBarrierSolved" | "notReadyReason" | "followUpNotes"
  >;
};

export async function POST(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const { sessionId, pointKey: rawPointKey } = await context.params;
    const pointKey = parsePointKey(rawPointKey);
    if (!pointKey) {
      return NextResponse.json({ error: "Invalid AI point key." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;

    const result =
      pointKey === CONSULTATION_AI_POINT_KEYS.MOTIVATION_INSIGHT
        ? await generateMotivationInsight({
            sessionId,
            memberId,
            regenerate: body.regenerate,
          })
        : await generateBarrierInsight({
            sessionId,
            memberId,
            regenerate: body.regenerate,
            barrierDraft: body.barrierDraft,
            readinessDraft: body.readinessDraft,
          });

    return NextResponse.json(result);
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to generate AI insight.");
    const status = message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
