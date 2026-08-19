import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { AnalysisSessionError } from "@/lib/analysis/analysis-session-service";
import {
  activateExperience21d,
  getExperience21dActivationContext,
} from "@/lib/analysis/handoff/experience-21d-activation";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const { id } = await context.params;
  const payload = await getExperience21dActivationContext(memberId, id);
  if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...payload });
}

export async function POST(request: Request, context: Ctx) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      customerId?: string;
      productReceivedDate?: string;
    };
    if (!body.customerId?.trim() || !body.productReceivedDate?.trim()) {
      return NextResponse.json({ error: "customerId and productReceivedDate required." }, { status: 400 });
    }
    const result = await activateExperience21d({
      ownerMemberId: memberId,
      customerId: body.customerId.trim(),
      productReceivedDate: body.productReceivedDate.trim(),
      interestId: id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AnalysisSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = toCoachingApiErrorMessage(error, "無法啟動 21 天體驗");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
