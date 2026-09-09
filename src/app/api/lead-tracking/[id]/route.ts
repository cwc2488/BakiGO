import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import {
  mapLeadTrackingHistoryRow,
  mapLeadTrackingRow,
  normalizeOptionalText,
  statusTextChanged,
} from "@/lib/lead-tracking/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().max(40).optional().nullable(),
  contactChannel: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  currentStatus: z.string().max(2000).optional().nullable(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional().nullable(),
  reminderEnabled: z.boolean().optional(),
  lastFollowedUpAt: z.string().datetime({ offset: true }).optional().nullable(),
  completeFollowUp: z.boolean().optional(),
});

function requireService() {
  if (!isSupabaseServiceConfigured()) return null;
  return createSupabaseServiceClient();
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("lead_tracking")
    .select("*")
    .eq("id", id)
    .eq("owner_member_id", memberId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "找不到名單" }, { status: 404 });
  }

  const { data: historyRows } = await supabase
    .from("lead_tracking_history")
    .select("*")
    .eq("lead_id", id)
    .eq("owner_member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    lead: mapLeadTrackingRow(data),
    history: (historyRows ?? []).map((row) => mapLeadTrackingHistoryRow(row)),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  }

  const { data: existing, error: loadError } = await supabase
    .from("lead_tracking")
    .select("*")
    .eq("id", id)
    .eq("owner_member_id", memberId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "找不到名單" }, { status: 404 });
  }

  const patch = parsed.data;
  const nextStatus =
    patch.currentStatus !== undefined
      ? normalizeOptionalText(patch.currentStatus)
      : existing.current_status;

  const nextFollowUpAt =
    patch.nextFollowUpAt !== undefined ? patch.nextFollowUpAt : existing.next_follow_up_at;

  const reminderEnabled =
    patch.reminderEnabled !== undefined
      ? Boolean(patch.reminderEnabled && nextFollowUpAt)
      : Boolean(existing.reminder_enabled && nextFollowUpAt);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.phone !== undefined) updates.phone = normalizeOptionalText(patch.phone);
  if (patch.contactChannel !== undefined) {
    updates.contact_channel = normalizeOptionalText(patch.contactChannel);
  }
  if (patch.notes !== undefined) updates.notes = normalizeOptionalText(patch.notes);
  if (patch.currentStatus !== undefined) updates.current_status = nextStatus;
  if (patch.nextFollowUpAt !== undefined) updates.next_follow_up_at = nextFollowUpAt;
  updates.reminder_enabled = reminderEnabled;

  if (patch.completeFollowUp) {
    updates.last_followed_up_at = new Date().toISOString();
  } else if (patch.lastFollowedUpAt !== undefined) {
    updates.last_followed_up_at = patch.lastFollowedUpAt;
  }

  const { data, error } = await supabase
    .from("lead_tracking")
    .update(updates)
    .eq("id", id)
    .eq("owner_member_id", memberId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "更新失敗" }, { status: 500 });
  }

  if (
    patch.currentStatus !== undefined &&
    statusTextChanged(existing.current_status, nextStatus) &&
    nextStatus
  ) {
    await supabase.from("lead_tracking_history").insert({
      lead_id: id,
      owner_member_id: memberId,
      status_text: nextStatus,
    });
  }

  const { data: historyRows } = await supabase
    .from("lead_tracking_history")
    .select("*")
    .eq("lead_id", id)
    .eq("owner_member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    lead: mapLeadTrackingRow(data),
    history: (historyRows ?? []).map((row) => mapLeadTrackingHistoryRow(row)),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { error, count } = await supabase
    .from("lead_tracking")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_member_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "找不到名單" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
