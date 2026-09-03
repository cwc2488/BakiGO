import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  updateTrainingItem,
  TrainingServiceError,
} from "@/lib/training/training-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      sortOrder?: unknown;
      isActive?: unknown;
    };

    const patch: { name?: string; sortOrder?: number; isActive?: boolean } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

    const item = await updateTrainingItem(id, patch);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TrainingServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update item." },
      { status: 500 },
    );
  }
}
