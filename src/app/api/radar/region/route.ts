import { NextResponse } from "next/server";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import {
  planRegionChange,
  promoteDueRegionPreference,
  resolveEffectiveRadarRegion,
} from "@/lib/radar/semantics/region-preference";
import { isValidTaiwanDevelopmentRegion } from "@/lib/radar/semantics/taiwan-development-regions";
import { TAIWAN_DEVELOPMENT_CITIES } from "@/lib/radar/semantics/taiwan-development-regions";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function regionPayload(
  preference: Awaited<ReturnType<SupabaseRadarRepository["getMemberRadarRegionPreference"]>>,
  today: string,
) {
  const effective = resolveEffectiveRadarRegion(preference, today);
  return {
    ok: true as const,
    today,
    current_city: preference?.current_city ?? null,
    current_district: preference?.current_district ?? null,
    pending_city: preference?.pending_city ?? null,
    pending_district: preference?.pending_district ?? null,
    pending_effective_date: preference?.pending_effective_date ?? null,
    effective_city: effective.city,
    effective_district: effective.district,
    cities: TAIWAN_DEVELOPMENT_CITIES.map((entry) => ({
      city: entry.city,
      districts: [...entry.districts],
    })),
  };
}

export async function GET(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  }

  const repo = new SupabaseRadarRepository(createSupabaseServiceClient());
  const today = resolveDailyPipelineRunDate({});
  let preference = await repo.getMemberRadarRegionPreference(member_id);
  if (preference) {
    const promoted = promoteDueRegionPreference(preference, today);
    if (promoted !== preference) {
      preference = await repo.upsertMemberRadarRegionPreference(promoted);
    }
  }
  return NextResponse.json(regionPayload(preference, today));
}

export async function PUT(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  }

  let body: { city?: unknown; district?: unknown } = {};
  try {
    body = (await request.json()) as { city?: unknown; district?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const city = typeof body.city === "string" ? body.city.trim() : "";
  const district =
    typeof body.district === "string" && body.district.trim() ? body.district.trim() : null;
  if (!city || !isValidTaiwanDevelopmentRegion({ city, district })) {
    return NextResponse.json({ ok: false, error: "請選擇有效的開發地區。" }, { status: 400 });
  }

  const repo = new SupabaseRadarRepository(createSupabaseServiceClient());
  const today = resolveDailyPipelineRunDate({});
  const existing = await repo.getMemberRadarRegionPreference(member_id);
  const next = planRegionChange({
    existing,
    member_id,
    city,
    district,
  });
  const saved = await repo.upsertMemberRadarRegionPreference(next);
  return NextResponse.json({
    ...regionPayload(saved, today),
    today_snapshot_unchanged: true,
  });
}
