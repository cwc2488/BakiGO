import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  TransformationError,
  getTransformationLeadForAdmin,
  updateTransformationLeadForAdmin,
} from "@/lib/transformation/transformation-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    const { id } = await context.params;
    const lead = await getTransformationLeadForAdmin(id);
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get lead." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (body.ownerPartnerId != null || body.partnerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid payload.", code: "forged_partner_id" },
        { status: 400 },
      );
    }
    const lead = await updateTransformationLeadForAdmin({
      leadId: id,
      status: body.status == null ? undefined : String(body.status),
      lostReason: body.lostReason === undefined ? undefined : body.lostReason == null ? null : String(body.lostReason),
      notes: body.notes === undefined ? undefined : body.notes == null ? null : String(body.notes),
      customerId:
        body.customerId === undefined ? undefined : body.customerId == null ? null : String(body.customerId),
      appointmentAt:
        body.appointmentAt === undefined
          ? undefined
          : body.appointmentAt == null
            ? null
            : String(body.appointmentAt),
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead." },
      { status: 500 },
    );
  }
}
