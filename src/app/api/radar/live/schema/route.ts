import { NextResponse } from "next/server";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import { applyMissingRadar014020, auditRadar014020 } from "@/lib/radar/live/remote-schema";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
  readSupabaseServiceEnv,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured" }, { status: 503 });
  }
  const client = createSupabaseServiceClient();
  const migrations = await auditRadar014020(client);
  return NextResponse.json({
    ok: Object.values(migrations).every((item) => item.applied),
    migrations,
  });
}

export async function POST(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured" }, { status: 503 });
  }

  const client = createSupabaseServiceClient();
  const { url } = readSupabaseServiceEnv();
  const projectRef = new URL(url).hostname.split(".")[0];
  const result = await applyMissingRadar014020({ client, projectRef });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
