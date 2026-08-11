import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createConsultationSession,
  serializeConsultationSession,
} from "@/lib/consultation/consultation-service";
import { toConsultationApiErrorMessage } from "@/lib/consultation/consultation-api-error";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Consultation service unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { customerId?: string };
    if (!body.customerId?.trim()) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }

    const record = await createConsultationSession({
      customerId: body.customerId.trim(),
      ownerMemberId: memberId,
    });

    return NextResponse.json({
      ok: true,
      ...serializeConsultationSession(record),
    });
  } catch (error) {
    const message = toConsultationApiErrorMessage(error, "Failed to create consultation session.");
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
