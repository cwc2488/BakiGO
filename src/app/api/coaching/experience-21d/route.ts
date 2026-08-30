import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { activateExperience21d } from "@/lib/analysis/handoff/experience-21d-activation";
import {
  CoachingServiceError,
  getActiveEnrollmentForCustomer,
  serializeCoachingEnrollment,
} from "@/lib/coaching/coaching-service";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import { resolveEnrollmentStartDate } from "@/lib/coaching/enrollment-window";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  ensureCustomerPortalTokenServiceRole,
  ensureOwnedCloudCustomer,
} from "@/lib/go21/ensure-cloud-customer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const customerId = new URL(request.url).searchParams.get("customerId")?.trim();
  if (!customerId) return NextResponse.json({ error: "customerId is required." }, { status: 400 });

  const supabase = createSupabaseServiceClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, display_name, deleted_at")
    .eq("id", customerId)
    .eq("owner_member_id", memberId)
    .maybeSingle();

  // Not yet in cloud (local CRM race) — do not 403; activation POST will upsert.
  if (!customer || customer.deleted_at) {
    return NextResponse.json({
      ok: true,
      customerSynced: false,
      customer: { id: customerId, displayName: "" },
      activeExperience: null,
      activeOtherCoaching: false,
      enrollment: null,
      portalToken: null,
    });
  }

  const active = await getActiveEnrollmentForCustomer({
    customerId,
    ownerMemberId: memberId,
  });

  let portalToken: string | null = null;
  try {
    portalToken = (await ensureCustomerPortalTokenServiceRole(customerId)).token;
  } catch {
    portalToken = null;
  }

  return NextResponse.json({
    ok: true,
    customerSynced: true,
    customer: { id: String(customer.id), displayName: String(customer.display_name) },
    activeExperience:
      active && isExperience21dEnrollment(active)
        ? {
            enrollmentId: active.id,
            startDate: resolveEnrollmentStartDate(active.startedAt),
            plannedEndAt: active.plannedEndAt ?? null,
            status: active.status,
          }
        : null,
    activeOtherCoaching: Boolean(active && !isExperience21dEnrollment(active)),
    enrollment: active ? serializeCoachingEnrollment(active) : null,
    portalToken,
  });
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const body = (await request.json()) as {
      customerId?: string;
      productReceivedDate?: string;
      interestId?: string | null;
      customerProfile?: {
        displayName?: string | null;
        phone?: string | null;
        lineId?: string | null;
        heightCm?: number | null;
        sex?: string | null;
        birthYear?: number | null;
        birthDate?: string | null;
      } | null;
      dailyTargets?: {
        waterMl?: number | null;
        caloriesKcal?: number | null;
        proteinG?: number | null;
        sleepHours?: number | null;
      } | null;
    };
    if (!body.customerId?.trim() || !body.productReceivedDate?.trim()) {
      return NextResponse.json({ error: "customerId and productReceivedDate required." }, { status: 400 });
    }
    const result = await activateExperience21d({
      ownerMemberId: memberId,
      customerId: body.customerId.trim(),
      productReceivedDate: body.productReceivedDate.trim(),
      interestId: body.interestId?.trim() || null,
      customerProfile: body.customerProfile ?? null,
      dailyTargets: body.dailyTargets ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法啟動 21 天體驗");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
