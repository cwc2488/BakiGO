import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { confirmDraw } from "@/lib/cleaning-roster/cleaning-roster-service";
import type {
  CleaningRosterPreviewAssignment,
  CleaningRosterPreviewRester,
} from "@/types/cleaning-roster";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const memberId = await requireCleaningRosterAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      idempotencyKey?: string;
      assignments?: CleaningRosterPreviewAssignment[];
      resting?: CleaningRosterPreviewRester[];
    };

    const result = await confirmDraw({
      confirmedByMemberId: memberId,
      idempotencyKey: String(body.idempotencyKey ?? ""),
      assignments: Array.isArray(body.assignments) ? body.assignments : [],
      resting: Array.isArray(body.resting) ? body.resting : [],
    });

    return NextResponse.json({
      ok: true,
      roundId: result.roundId,
      duplicate: result.duplicate,
      data: result.bootstrap,
    });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
