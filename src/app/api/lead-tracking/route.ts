import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import {
  mapLeadTrackingRow,
  normalizeOptionalText,
} from "@/lib/lead-tracking/types";
import { filterLeads, sortLeadsForList, countLeadBadges } from "@/lib/lead-tracking/list-utils";
import type { LeadTrackingFilter } from "@/lib/lead-tracking/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().max(40).optional().nullable(),
  contactChannel: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  currentStatus: z.string().max(2000).optional().nullable(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional().nullable(),
  reminderEnabled: z.boolean().optional(),
});

function requireService() {
  if (!isSupabaseServiceConfigured()) return null;
  return createSupabaseServiceClient();
}

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") ?? "all") as LeadTrackingFilter;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));

  const { data, error } = await supabase
    .from("lead_tracking")
    .select("*")
    .eq("owner_member_id", memberId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit, 200));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? []).map((row) => mapLeadTrackingRow(row));
  const badges = countLeadBadges(leads);
  const filtered = sortLeadsForList(filterLeads(leads, filter)).slice(0, limit);

  return NextResponse.json({ leads: filtered, badges, total: leads.length });
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
  }

  const currentStatus = normalizeOptionalText(parsed.data.currentStatus);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("lead_tracking")
    .insert({
      owner_member_id: memberId,
      name: parsed.data.name.trim(),
      phone: normalizeOptionalText(parsed.data.phone),
      contact_channel: normalizeOptionalText(parsed.data.contactChannel),
      notes: normalizeOptionalText(parsed.data.notes),
      current_status: currentStatus,
      next_follow_up_at: parsed.data.nextFollowUpAt ?? null,
      reminder_enabled: Boolean(parsed.data.reminderEnabled && parsed.data.nextFollowUpAt),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "建立失敗" }, { status: 500 });
  }

  if (currentStatus) {
    await supabase.from("lead_tracking_history").insert({
      lead_id: data.id,
      owner_member_id: memberId,
      status_text: currentStatus,
    });
  }

  return NextResponse.json({ lead: mapLeadTrackingRow(data) }, { status: 201 });
}
