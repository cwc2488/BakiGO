import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { loadGo21PortalBundle } from "@/lib/go21/go21-portal";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { isReengagementDue } from "@/lib/go21/reminders";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    // loadGo21PortalBundle enforces eligibility + delivers due reminders into turns
    const bundle = await loadGo21PortalBundle(token);

    let turns: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      channel: string | null;
    }> = [];

    try {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from("coaching_ai_turns")
        .select("id, role, content, created_at, channel, metadata")
        .eq("enrollment_id", bundle.enrollmentId)
        .order("created_at", { ascending: true })
        .limit(80);
      turns = (data ?? []).map((row) => ({
        id: String(row.id),
        role: String(row.role),
        content: String(row.content),
        createdAt: String(row.created_at),
        channel: row.channel ? String(row.channel) : null,
      }));
    } catch {
      const store = getSharedInMemoryV2Store();
      const mem = await store.loadMemoryBundle({
        enrollmentId: bundle.enrollmentId,
        logDate: coachingTodayLogDate(),
        recentTurnLimit: 40,
      });
      turns = mem.recentTurns.map((t) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        createdAt: t.createdAt,
        channel: t.channel,
      }));
    }

    const lastCustomerTurn = [...turns].reverse().find((t) => t.role === "customer");
    const lastActiveDate = lastCustomerTurn?.createdAt?.slice(0, 10) ?? null;
    const suggestReengagement = isReengagementDue(lastActiveDate);

    // Surface recently delivered reminder turns as coach-initiated messages (already in thread)
    const reminderTurns = turns.filter((t) => t.channel === "system").slice(-3);

    return NextResponse.json({
      ok: true,
      go21: {
        brandName: bundle.brandName,
        brandSubtitle: bundle.brandSubtitle,
        isGo21: bundle.isGo21,
        go21StartedAt: bundle.go21StartedAt,
        dayNumber: bundle.dayNumber,
        dayTotal: bundle.dayTotal,
        lifecycleAnchorDate: bundle.lifecycleAnchorDate,
        lifecycleStage: bundle.lifecycleStage,
        milestones: bundle.milestones,
        customerProfile: bundle.customerProfile,
        latestBody: bundle.latestBody,
        needsBaseline: bundle.needsBaseline,
        turns,
        reminders: reminderTurns.map((t) => ({
          id: t.id,
          kind: "in_app",
          message: t.content,
          dueAt: t.createdAt,
        })),
        suggestReengagement,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入 Baki Go 21");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
