import { NextResponse } from "next/server";
import { getConsultationBrief } from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
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
    const brief = await getConsultationBrief({ sessionId, memberId });
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to load consultation brief.");
    const status = message === "Forbidden" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
