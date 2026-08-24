import { noStoreJson } from "@/lib/radar/jobs/auto-drain";
import { runPipelineFinalizer } from "@/lib/radar/pipeline/run-finalizer";
import { SupabasePipelineStore } from "@/lib/radar/pipeline/supabase-pipeline-store";
import { resolveDailyPipelineRunDate } from "@/lib/radar/pipeline/run-date";
import {
  createSupabaseServiceClient,
  isRadarCronAuthorized,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinalizeBody = {
  pipeline_run_id?: string;
  run_date?: string;
};

export async function POST(request: Request) {
  if (!isRadarCronAuthorized(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return noStoreJson({ error: "Supabase service role is not configured" }, { status: 503 });
  }

  let body: FinalizeBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as FinalizeBody;
    }
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
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
      return noStoreJson({ error: "pipeline_run_id or run_date required" }, { status: 400 });
    }

    const result = await runPipelineFinalizer(store, { pipeline_run_id });
    return noStoreJson({ ok: true, ...result });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Pipeline finalizer failed";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
