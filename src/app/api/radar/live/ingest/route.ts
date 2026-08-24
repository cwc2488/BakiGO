import { NextResponse } from "next/server";
import { createDiscoveryRequestBudget } from "@/lib/radar/discovery/discovery-request-budget";
import {
  ingestLiveThreadsKeywords,
  LIVE_INGEST_KEYWORD_SEARCH_HTTP_CAP,
} from "@/lib/radar/live/ingest-live-threads";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngestBody = {
  keywords?: string[];
  maxCandidatesPerKeyword?: number;
};

export async function POST(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase service role is not configured" },
      { status: 503 },
    );
  }

  let body: IngestBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as IngestBody;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceClient();
    const repo = new SupabaseRadarRepository(client);
    const members = await repo.listActiveMembers();
    const result = await ingestLiveThreadsKeywords({
      repo,
      keywords: body.keywords,
      memberId: members[0]?.member_id ?? null,
      maxCandidatesPerKeyword: Math.min(body.maxCandidatesPerKeyword ?? 2, 5),
      discovery_request_budget: createDiscoveryRequestBudget(LIVE_INGEST_KEYWORD_SEARCH_HTTP_CAP),
    });

    return NextResponse.json({
      ok: result.ok,
      mode: "live",
      THREADS_ACCESS_TOKEN: process.env.THREADS_ACCESS_TOKEN ? "PRESENT" : "ABSENT",
      ingested_candidate_ids: result.ingested_candidate_ids,
      keyword_search_http_requests: result.keyword_search_http_requests,
      request_budget_limit: result.request_budget_limit,
      request_budget_consumed: result.request_budget_consumed,
      keywords: result.keywords,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Live ingest failed.",
      },
      { status: 502 },
    );
  }
}
