import { NextResponse } from "next/server";
import { runPipelineFinalizer } from "@/lib/radar/pipeline/run-finalizer";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type FinalizeBody = {
  pipeline_run_id?: string;
  run_date?: string;
};

export async function POST(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  let body: FinalizeBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as FinalizeBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceClient();
    const store = new SupabasePipelineStore(client);
    let pipeline_run_id = body.pipeline_run_id;

    if (!pipeline_run_id && body.run_date) {
      const run = await store.findPipelineRunByDate(body.run_date);
      pipeline_run_id = run?.id;
    }

    if (!pipeline_run_id && body.run_date === undefined) {
      const run_date = resolveDailyPipelineRunDate({});
      const run = await store.findPipelineRunByDate(run_date);
      pipeline_run_id = run?.id;
    }

    if (!pipeline_run_id) {
      return NextResponse.json({ error: "pipeline_run_id or run_date required" }, { status: 400 });
    }

    const result = await runPipelineFinalizer(store, { pipeline_run_id });
    return NextResponse.json({ ok: true, ...result });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Pipeline finalizer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
