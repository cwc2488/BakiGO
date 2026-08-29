import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { loadGo21PortalBundle } from "@/lib/go21/go21-portal";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  buildDeterministicReminderPreview,
  isReengagementDue,
} from "@/lib/go21/reminders";
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
    const bundle = await loadGo21PortalBundle(token);

    // Recent turns: prefer DB, fall back to in-memory store
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
        .select("id, role, content, created_at, channel")
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

    // In-app due reminders (deterministic preview)
    const reminders: Array<{ id: string; kind: string; message: string; dueAt: string }> = [];
    try {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from("coaching_ai_reminders")
        .select("id, kind, due_at, message_preview, context_json, status")
        .eq("enrollment_id", bundle.enrollmentId)
        .eq("status", "scheduled")
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true })
        .limit(3);
      for (const row of data ?? []) {
        reminders.push({
          id: String(row.id),
          kind: String(row.kind),
          message:
            (row.message_preview as string | null) ||
            buildDeterministicReminderPreview({ kind: row.kind as never }),
          dueAt: String(row.due_at),
        });
      }
      // Mark delivered in-app so we do not re-spam the same due reminders.
      if ((data ?? []).length > 0) {
        await supabase
          .from("coaching_ai_reminders")
          .update({
            status: "delivered",
            delivered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in(
            "id",
            (data ?? []).map((row) => row.id),
          );
      }
    } catch {
      // table may not exist yet
    }

    const lastCustomerTurn = [...turns].reverse().find((t) => t.role === "customer");
    const lastActiveDate = lastCustomerTurn?.createdAt?.slice(0, 10) ?? null;
    const suggestReengagement = isReengagementDue(lastActiveDate);

    return NextResponse.json({
      ok: true,
      go21: {
        brandName: bundle.brandName,
        brandSubtitle: bundle.brandSubtitle,
        isGo21: bundle.isGo21,
        go21StartedAt: bundle.go21StartedAt,
        dayNumber: bundle.dayNumber,
        dayTotal: bundle.dayTotal,
        lifecycleStage: bundle.lifecycleStage,
        milestones: bundle.milestones,
        customerProfile: bundle.customerProfile,
        latestBody: bundle.latestBody,
        needsBaseline: bundle.needsBaseline,
        turns,
        reminders,
        suggestReengagement,
      },
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法載入 Baki Go 21");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
