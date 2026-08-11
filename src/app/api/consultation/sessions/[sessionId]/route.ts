import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  getConsultationSession,
  serializeConsultationSession,
} from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const { sessionId } = await context.params;
    const record = await getConsultationSession({ sessionId, memberId });
    return NextResponse.json({
      ok: true,
      ...serializeConsultationSession(record),
    });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to load consultation session.");
    const status = message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
