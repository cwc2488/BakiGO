import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  signOffTrainingItem,
  TrainingServiceError,
} from "@/lib/training/training-service";

export const runtime = "nodejs";

type Body = {
  traineeMemberId?: unknown;
  trainingItemId?: unknown;
  signerMemberId?: unknown;
};

export async function POST(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const traineeMemberId =
      typeof body.traineeMemberId === "string" ? body.traineeMemberId.trim() : "";
    const trainingItemId =
      typeof body.trainingItemId === "string" ? body.trainingItemId.trim() : "";

    // Ignore any client-supplied signer identity — session member is the only signer.
    void body.signerMemberId;

    if (!traineeMemberId || !trainingItemId) {
      return NextResponse.json(
        { error: "traineeMemberId and trainingItemId are required." },
        { status: 400 },
      );
    }

    const signoff = await signOffTrainingItem({
      viewerMemberId: memberId,
      traineeMemberId,
      trainingItemId,
    });
    return NextResponse.json({ ok: true, signoff });
  } catch (error) {
    if (error instanceof TrainingServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign off." },
      { status: 500 },
    );
  }
}
