import { NextResponse } from "next/server";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_TEXT_MARKER = "最近開始認真思考";

type AuditRow = {
  id: string;
  adapter_id: string;
  endpoint: string;
  candidate_id: string | null;
  status: string;
  error_code: string | null;
  metadata: { mode?: unknown; phrase?: unknown } | null;
  fetched_at: string;
};

function mapAudit(row: AuditRow) {
  return {
    id: row.id,
    adapter_id: row.adapter_id,
    endpoint: row.endpoint,
    candidate_id: row.candidate_id,
    status: row.status,
    error_code: row.error_code,
    mode: row.metadata?.mode ?? null,
    phrase: row.metadata?.phrase ?? null,
    fetched_at: row.fetched_at,
  };
}

export async function GET(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const ids = url.searchParams.get("candidate_ids")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const keywords = url.searchParams.get("keywords")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "candidate_ids is required" }, { status: 400 });
  }

  const client = createSupabaseServiceClient();

  const { data: candidates, error: candidateError } = await client
    .from("candidate_pool")
    .select("id, display_name, primary_platform, normalized_username, acquisition_source, lifecycle_state")
    .in("id", ids);
  if (candidateError) {
    return NextResponse.json({ ok: false, error: candidateError.message, table: "candidate_pool" }, { status: 500 });
  }

  const { data: snapshots, error: snapshotError } = await client
    .from("candidate_content_snapshots_raw")
    .select("id, candidate_id, platform, external_content_id, adapter_version, fetch_completeness, payload, fetched_at")
    .in("candidate_id", ids);
  if (snapshotError) {
    return NextResponse.json({ ok: false, error: snapshotError.message, table: "candidate_content_snapshots_raw" }, { status: 500 });
  }

  const { data: discoveries, error: discoveryError } = await client
    .from("candidate_discoveries")
    .select("id, member_id, candidate_id, keyword_phrase, discovery_source, org_keyword_phrase, discovered_at")
    .in("candidate_id", ids);
  if (discoveryError) {
    return NextResponse.json({ ok: false, error: discoveryError.message, table: "candidate_discoveries" }, { status: 500 });
  }

  const { data: candidateAudits, error: auditError } = await client
    .from("source_fetch_audit_log")
    .select("id, adapter_id, endpoint, candidate_id, status, error_code, metadata, fetched_at")
    .in("candidate_id", ids);
  if (auditError) {
    return NextResponse.json({ ok: false, error: auditError.message, table: "source_fetch_audit_log" }, { status: 500 });
  }

  let keywordAudits: AuditRow[] = [];
  if (keywords.length > 0) {
    const { data, error } = await client
      .from("source_fetch_audit_log")
      .select("id, adapter_id, endpoint, candidate_id, status, error_code, metadata, fetched_at")
      .eq("endpoint", "keyword_search")
      .order("fetched_at", { ascending: false })
      .limit(50);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, table: "source_fetch_audit_log" }, { status: 500 });
    }
    keywordAudits = ((data ?? []) as AuditRow[]).filter((row) =>
      keywords.includes(String(row.metadata?.phrase ?? "")),
    );
  }

  const { data: signals, error: signalError } = await client
    .from("candidate_discovery_signals")
    .select("id, candidate_id, signal_type, expires_at")
    .in("candidate_id", ids);
  if (signalError) {
    return NextResponse.json({ ok: false, error: signalError.message, table: "candidate_discovery_signals" }, { status: 500 });
  }

  const audits = [...((candidateAudits ?? []) as AuditRow[]), ...keywordAudits];
  const fixtureHits = [
    ...(candidates ?? []).filter((row) => {
      const username = String(row.normalized_username ?? "");
      const id = String(row.id ?? "");
      return username.startsWith("user_") || (id.startsWith("cand_") && !id.startsWith("cand_threads_"));
    }),
    ...(snapshots ?? []).filter((row) => {
      const payload = row.payload as { text?: unknown } | null;
      return typeof payload?.text === "string" && payload.text.includes(FIXTURE_TEXT_MARKER);
    }),
    ...audits.filter((row) => row.metadata?.mode === "fixture"),
  ];

  return NextResponse.json({
    ok: (candidates ?? []).length > 0 && (snapshots ?? []).length > 0,
    source: "supabase_direct",
    candidate_count: (candidates ?? []).length,
    snapshot_count: (snapshots ?? []).length,
    discovery_count: (discoveries ?? []).length,
    audit_count: audits.length,
    signal_count: (signals ?? []).length,
    candidates: candidates ?? [],
    snapshots: (snapshots ?? []).map((row) => ({
      id: row.id,
      candidate_id: row.candidate_id,
      platform: row.platform,
      external_content_id: row.external_content_id,
      adapter_version: row.adapter_version,
      fetch_completeness: row.fetch_completeness,
      fetched_at: row.fetched_at,
      has_text: Boolean((row.payload as { text?: unknown } | null)?.text),
      permalink: (row.payload as { permalink?: unknown } | null)?.permalink ?? null,
    })),
    discoveries: discoveries ?? [],
    audits: audits.map(mapAudit),
    signals: signals ?? [],
    fixture_contamination: fixtureHits.length,
  });
}
