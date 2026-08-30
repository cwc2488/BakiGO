import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  getActiveEnrollmentForCustomer,
  serializeCoachingEnrollment,
} from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import {
  ensureCustomerPortalTokenServiceRole,
  ensureOwnedCloudCustomer,
} from "@/lib/go21/ensure-cloud-customer";

export const runtime = "nodejs";

/**
 * Coach-facing Go21 status for a customer detail card.
 * Uses service-role portal token ensure — never depends on browser RLS hanging.
 */
export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const customerId = new URL(request.url).searchParams.get("customerId")?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }

  try {
    const enrollment = await getActiveEnrollmentForCustomer({
      customerId,
      ownerMemberId: memberId,
    });
    const isGo21 = Boolean(enrollment && isExperience21dEnrollment(enrollment));

    let portalToken: string | null = null;
    // Only mint token when we know the customer is owned (enrollment or ensure with empty profile fails if not owned)
    if (enrollment) {
      try {
        portalToken = (await ensureCustomerPortalTokenServiceRole(customerId)).token;
      } catch {
        portalToken = null;
      }
    }

    return NextResponse.json({
      ok: true,
      enrollment: enrollment ? serializeCoachingEnrollment(enrollment) : null,
      isGo21,
      portalToken,
      go21Path: portalToken ? `/c/${portalToken}/go21` : null,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入 Baki Go 21 狀態");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Upsert local customer into cloud + ensure portal token (pre-activation sync). */
export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      displayName?: string | null;
      phone?: string | null;
      lineId?: string | null;
      heightCm?: number | null;
      sex?: string | null;
      birthYear?: number | null;
      birthDate?: string | null;
      ensurePortalToken?: boolean;
    };
    if (!body.customerId?.trim()) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }
    const customerId = body.customerId.trim();
    const ensured = await ensureOwnedCloudCustomer({
      ownerMemberId: memberId,
      customerId,
      profile: {
        displayName: body.displayName,
        phone: body.phone,
        lineId: body.lineId,
        heightCm: body.heightCm,
        sex: body.sex,
        birthYear: body.birthYear,
        birthDate: body.birthDate,
      },
    });

    let portalToken: string | null = null;
    if (body.ensurePortalToken !== false) {
      portalToken = (await ensureCustomerPortalTokenServiceRole(customerId)).token;
    }

    const enrollment = await getActiveEnrollmentForCustomer({
      customerId,
      ownerMemberId: memberId,
    });

    return NextResponse.json({
      ok: true,
      customer: ensured,
      portalToken,
      go21Path: portalToken ? `/c/${portalToken}/go21` : null,
      enrollment: enrollment ? serializeCoachingEnrollment(enrollment) : null,
      isGo21: Boolean(enrollment && isExperience21dEnrollment(enrollment)),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法同步顧客到雲端");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
