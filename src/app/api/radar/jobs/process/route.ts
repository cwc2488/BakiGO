import { NextResponse } from "next/server";
import { createSupabaseRadarJobQueue } from "@/lib/radar/jobs/supabase-queue-store";
import { runWorkerBatch } from "@/lib/radar/jobs/workers/dispatch";
import { createSourceAdapterRegistry } from "@/lib/radar/sources/registry";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  let limit = 25;
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = (await request.json()) as { limit?: number };
      if (body.limit) limit = body.limit;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceClient();
    const repo = new SupabaseRadarRepository(client);
    const sources = createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    });
    const processed = await runWorkerBatch(
      {
        repo,
        queue: createSupabaseRadarJobQueue(client),
        sources,
        pipelineStore: new SupabasePipelineStore(client),
      },
      limit,
    );

    return NextResponse.json({ ok: true, processed });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Worker batch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
