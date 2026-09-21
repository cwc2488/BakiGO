import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  addLearningLink,
  removeLearningLink,
  TrainingServiceError,
} from "@/lib/training/training-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      trainingItemId?: unknown;
      learningResourceId?: unknown;
    };
    const trainingItemId =
      typeof body.trainingItemId === "string" ? body.trainingItemId.trim() : "";
    const learningResourceId =
      typeof body.learningResourceId === "string" ? body.learningResourceId.trim() : "";

    if (!trainingItemId || !learningResourceId) {
      return NextResponse.json(
        { error: "trainingItemId and learningResourceId are required." },
        { status: 400 },
      );
    }

    const link = await addLearningLink({ trainingItemId, learningResourceId });
    return NextResponse.json({ ok: true, link });
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
      { error: error instanceof Error ? error.message : "Failed to add link." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const url = new URL(request.url);
    const linkId = url.searchParams.get("linkId")?.trim() ?? "";
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required." }, { status: 400 });
    }

    await removeLearningLink(linkId);
    return NextResponse.json({ ok: true });
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
      { error: error instanceof Error ? error.message : "Failed to remove link." },
      { status: 500 },
    );
  }
}
